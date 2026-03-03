import logging
import math
import threading
import uuid
from collections import Counter, defaultdict
from urllib.parse import urljoin

import requests
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    AdminActivityLog,
    CommentReport,
    HomepageConfig,
    Movie,
    MovieCategory,
    MovieCategoryAssignment,
    MovieComment,
    MovieFavorite,
    MovieRating,
    MovieWatchHistory,
)
from .permissions import HasMoviePermission, get_user_permissions, get_user_role, user_has_permission
from .serializers import (
    AdminActivityLogSerializer,
    CommentReportSerializer,
    HomepageConfigSerializer,
    MovieCategorySerializer,
    MovieCommentSerializer,
    MovieDetailSerializer,
    MovieFavoriteSerializer,
    MovieListSerializer,
    MovieRatingSerializer,
    MovieSummarySerializer,
    MovieWatchHistorySerializer,
)
from .services import _normalize_text, fetch_source_movie, sync_movies_range, upsert_movie_from_source


logger = logging.getLogger(__name__)
UserModel = get_user_model()


def _split_filter_values(raw_value: str) -> list[str]:
    return [part.strip() for part in (raw_value or "").split(",") if part.strip()]


def _apply_tag_filter(queryset, field_name: str, raw_value: str):
    values = _split_filter_values(raw_value)
    for value in values:
        queryset = queryset.filter(**{f"{field_name}__icontains": f"|{_normalize_text(value)}|"})
    return queryset


def _is_admin_user(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or getattr(user, "role", "") == "admin"))


def _log_admin_action(actor, action, target_type="", target_id="", metadata=None):
    AdminActivityLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id or ""),
        metadata=metadata or {},
    )


def _refresh_movie_rating(movie: Movie):
    aggregate = movie.ratings.aggregate(avg_rating=Avg("score"), total_reviews=Count("id"))
    movie.average_rating = round(float(aggregate.get("avg_rating") or 0), 2)
    movie.review_count = int(aggregate.get("total_reviews") or 0)
    movie.save(update_fields=["average_rating", "review_count", "updated_at"])


def _recommend_movies_for_user(user, exclude_movie_id=None, limit=8):
    if not user.is_authenticated:
        queryset = Movie.objects.filter(is_deleted=False).exclude(id=exclude_movie_id).order_by("-average_rating", "-source_modified")
        return list(queryset[:limit])

    user_ratings = MovieRating.objects.filter(user=user).select_related("movie")
    user_histories = MovieWatchHistory.objects.filter(user=user).select_related("movie")[:100]

    rated_movie_ids = {item.movie_id for item in user_ratings}
    watched_movie_ids = {item.movie_id for item in user_histories}
    excluded_ids = rated_movie_ids | watched_movie_ids
    if exclude_movie_id:
        excluded_ids.add(exclude_movie_id)

    genre_weights = defaultdict(float)
    country_weights = defaultdict(float)

    for rating in user_ratings:
        weight = float(rating.score)
        for genre in rating.movie.genres or []:
            genre_weights[_normalize_text(genre)] += weight
        for country in rating.movie.countries or []:
            country_weights[_normalize_text(country)] += weight * 0.8

    for history in user_histories:
        completion_bonus = 0.3
        if history.total_seconds > 0:
            completion_bonus += min(history.watched_seconds / history.total_seconds, 1) * 0.7
        for genre in history.movie.genres or []:
            genre_weights[_normalize_text(genre)] += completion_bonus
        for country in history.movie.countries or []:
            country_weights[_normalize_text(country)] += completion_bonus * 0.6

    candidates = (
        Movie.objects.filter(is_deleted=False).exclude(id__in=excluded_ids)
        .order_by("-source_modified", "-updated_at")[:500]
    )

    scored_movies = []
    for movie in candidates:
        genre_score = sum(genre_weights.get(_normalize_text(genre), 0) for genre in movie.genres or [])
        country_score = sum(country_weights.get(_normalize_text(country), 0) for country in movie.countries or [])
        rating_signal = (movie.average_rating or 0) * 2.5 + math.log10((movie.review_count or 0) + 1) * 1.5
        total_score = genre_score * 1.8 + country_score * 1.2 + rating_signal
        scored_movies.append((total_score, movie))

    scored_movies.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored_movies[:limit]]


class MovieViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Movie.objects.filter(is_deleted=False)
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_serializer_class(self):
        if self.action == "list":
            return MovieListSerializer
        return MovieDetailSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params

        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(original_name__icontains=search)
                | Q(slug__icontains=search)
                | Q(director__icontains=search)
                | Q(casts__icontains=search)
            )

        if params.get("quality"):
            queryset = queryset.filter(quality__icontains=params.get("quality", "").strip())
        if params.get("language"):
            queryset = queryset.filter(language__icontains=params.get("language", "").strip())

        queryset = _apply_tag_filter(queryset, "genre_tags", params.get("genre", ""))
        queryset = _apply_tag_filter(queryset, "country_tags", params.get("country", ""))
        queryset = _apply_tag_filter(queryset, "year_tags", params.get("year", ""))
        queryset = _apply_tag_filter(queryset, "format_tags", params.get("format", ""))

        min_rating = params.get("min_rating")
        if min_rating:
            try:
                queryset = queryset.filter(average_rating__gte=float(min_rating))
            except ValueError:
                pass

        max_rating = params.get("max_rating")
        if max_rating:
            try:
                queryset = queryset.filter(average_rating__lte=float(max_rating))
            except ValueError:
                pass

        ordering = params.get("ordering", "").strip()
        allowed_ordering = {
            "name",
            "-name",
            "created_at",
            "-created_at",
            "updated_at",
            "-updated_at",
            "source_modified",
            "-source_modified",
            "average_rating",
            "-average_rating",
            "review_count",
            "-review_count",
        }
        if ordering in allowed_ordering:
            queryset = queryset.order_by(ordering)

        limit = params.get("limit", "").strip()
        if limit.isdigit():
            queryset = queryset[: int(limit)]

        return queryset

    def retrieve(self, request, *args, **kwargs):
        movie = self.get_object()
        movie_payload = MovieDetailSerializer(movie).data

        related_queryset = Movie.objects.exclude(id=movie.id)
        if movie.genres:
            primary_genre = _normalize_text(movie.genres[0])
            related_queryset = related_queryset.filter(genre_tags__icontains=f"|{primary_genre}|")
        if movie.countries:
            primary_country = _normalize_text(movie.countries[0])
            related_queryset = related_queryset.filter(country_tags__icontains=f"|{primary_country}|")

        related_movies = MovieSummarySerializer(
            related_queryset.order_by("-average_rating", "-source_modified")[:8], many=True
        ).data
        suggested_movies = MovieSummarySerializer(
            _recommend_movies_for_user(request.user, exclude_movie_id=movie.id, limit=8), many=True
        ).data

        comments = MovieCommentSerializer(movie.comments.select_related("user")[:20], many=True).data
        ratings = MovieRatingSerializer(movie.ratings.select_related("user")[:20], many=True).data

        user_rating = None
        is_favorite = False
        if request.user.is_authenticated:
            user_rating_obj = MovieRating.objects.filter(movie=movie, user=request.user).first()
            if user_rating_obj:
                user_rating = MovieRatingSerializer(user_rating_obj).data
            is_favorite = MovieFavorite.objects.filter(movie=movie, user=request.user).exists()

        return Response(
            {
                "movie": movie_payload,
                "related_movies": related_movies,
                "suggested_movies": suggested_movies,
                "comments": comments,
                "ratings": ratings,
                "user_rating": user_rating,
                "is_favorite": is_favorite,
            }
        )


class MovieSyncAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug: str):
        try:
            movie_data = fetch_source_movie(slug=slug)
            movie = upsert_movie_from_source(movie_data=movie_data)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Failed to fetch movie from source API. slug=%s", slug)
            return Response(
                {"detail": "Cannot fetch data from movie source API.", "error": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        serializer = MovieDetailSerializer(movie)
        return Response(serializer.data, status=status.HTTP_200_OK)


class MovieHomeAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        cache_key = f"movie_home_payload_{request.user.id if request.user.is_authenticated else 'anon'}"
        cached_payload = cache.get(cache_key)
        if cached_payload:
            return Response(cached_payload)

        latest_movies = list(Movie.objects.filter(is_deleted=False).order_by("-source_modified", "-updated_at")[:8])
        featured_movie = latest_movies[0] if latest_movies else None

        used_ids = {movie.id for movie in latest_movies}

        def pick_unique(queryset, limit=8):
            picked = []
            for item in queryset:
                if item.id in used_ids:
                    continue
                picked.append(item)
                used_ids.add(item.id)
                if len(picked) >= limit:
                    break
            return picked

        trending_today = pick_unique(
            Movie.objects.filter(is_deleted=False).order_by("-review_count", "-average_rating", "-source_modified")[:120],
            limit=8,
        )
        action_movies = pick_unique(
            Movie.objects.filter(is_deleted=False, genre_tags__icontains="|hanh dong|").order_by("-source_modified", "-updated_at")[:120],
            limit=8,
        )
        china_movies = pick_unique(
            Movie.objects.filter(is_deleted=False, country_tags__icontains="|trung quoc|").order_by("-source_modified", "-updated_at")[:120],
            limit=8,
        )
        recommended = pick_unique(_recommend_movies_for_user(request.user, limit=40), limit=8)

        config, _ = HomepageConfig.objects.get_or_create(key="default")
        payload = {
            "featured_movie": MovieSummarySerializer(featured_movie).data if featured_movie else None,
            "latest_updated": MovieSummarySerializer(latest_movies, many=True).data,
            "trending_today": MovieSummarySerializer(trending_today, many=True).data,
            "action_movies": MovieSummarySerializer(action_movies, many=True).data,
            "china_movies": MovieSummarySerializer(china_movies, many=True).data,
            "recommended_for_you": MovieSummarySerializer(recommended, many=True).data,
            "homepage_config": HomepageConfigSerializer(config).data,
        }
        cache.set(cache_key, payload, 60)
        return Response(payload)


class MovieFilterOptionsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        genres = set()
        countries = set()
        years = set()
        for movie in Movie.objects.filter(is_deleted=False).only("genres", "countries", "years"):
            genres.update([value for value in movie.genres if value])
            countries.update([value for value in movie.countries if value])
            years.update([value for value in movie.years if value])

        return Response(
            {
                "genres": sorted(genres, key=lambda value: value.lower()),
                "countries": sorted(countries, key=lambda value: value.lower()),
                "years": sorted(years, reverse=True),
                "ratings": [1, 2, 3, 4, 5],
            }
        )


class MovieCommentsAPIView(APIView):
    permission_classes = [AllowAny]

    def get_movie(self, slug: str) -> Movie:
        return Movie.objects.get(slug=slug)

    def get(self, request, slug: str):
        try:
            movie = self.get_movie(slug=slug)
        except Movie.DoesNotExist:
            return Response({"detail": "Movie not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = movie.comments.select_related("user").all()[:50]
        serializer = MovieCommentSerializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request, slug: str):
        if not request.user.is_authenticated:
            return Response({"detail": "Please login to comment."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            movie = self.get_movie(slug=slug)
        except Movie.DoesNotExist:
            return Response({"detail": "Movie not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = MovieCommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(movie=movie, user=request.user, guest_name=request.user.fullname or "")
        return Response(MovieCommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class MovieRatingsAPIView(APIView):
    permission_classes = [AllowAny]

    def get_movie(self, slug: str) -> Movie:
        return Movie.objects.get(slug=slug)

    def get(self, request, slug: str):
        try:
            movie = self.get_movie(slug=slug)
        except Movie.DoesNotExist:
            return Response({"detail": "Movie not found."}, status=status.HTTP_404_NOT_FOUND)
        queryset = movie.ratings.select_related("user").all()[:50]
        return Response(MovieRatingSerializer(queryset, many=True).data)

    def post(self, request, slug: str):
        if not request.user.is_authenticated:
            return Response({"detail": "Please login to rate."}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            movie = self.get_movie(slug=slug)
        except Movie.DoesNotExist:
            return Response({"detail": "Movie not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = MovieRatingSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        rating, _ = MovieRating.objects.update_or_create(
            movie=movie,
            user=request.user,
            defaults={
                "score": serializer.validated_data["score"],
                "review": serializer.validated_data.get("review", ""),
            },
        )
        _refresh_movie_rating(movie)
        return Response(MovieRatingSerializer(rating).data, status=status.HTTP_200_OK)


class MovieFavoriteToggleAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug: str):
        movie = Movie.objects.filter(slug=slug).first()
        if not movie:
            return Response({"detail": "Movie not found."}, status=status.HTTP_404_NOT_FOUND)
        favorite, created = MovieFavorite.objects.get_or_create(movie=movie, user=request.user)
        if not created:
            favorite.delete()
            return Response({"is_favorite": False})
        return Response({"is_favorite": True})


class MovieFavoritesAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = MovieFavorite.objects.filter(user=request.user).select_related("movie")
        return Response(MovieFavoriteSerializer(queryset, many=True).data)


class MovieWatchHistoryAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = MovieWatchHistory.objects.filter(user=request.user).select_related("movie")[:50]
        return Response(MovieWatchHistorySerializer(queryset, many=True).data)

    def post(self, request):
        slug = (request.data.get("slug") or "").strip()
        movie = Movie.objects.filter(slug=slug).first()
        if not movie:
            return Response({"detail": "Movie not found."}, status=status.HTTP_404_NOT_FOUND)

        history, _ = MovieWatchHistory.objects.update_or_create(
            movie=movie,
            user=request.user,
            defaults={
                "episode_slug": request.data.get("episode_slug", ""),
                "episode_name": request.data.get("episode_name", ""),
                "watched_seconds": int(request.data.get("watched_seconds", 0) or 0),
                "total_seconds": int(request.data.get("total_seconds", 0) or 0),
            },
        )
        return Response(MovieWatchHistorySerializer(history).data, status=status.HTTP_200_OK)


class MovieAdminSyncAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "sync.run"

    @staticmethod
    def _cache_key(job_id: str) -> str:
        return f"movie_sync_job_{job_id}"

    @classmethod
    def _run_sync_job(cls, job_id: str, actor_id: int | None, payload: dict):
        cache_key = cls._cache_key(job_id)
        feed_type = payload.get("feed_type", "the-loai")
        from_page = payload.get("from_page", 1)
        to_page = payload.get("to_page", 5)
        try:
            summary = sync_movies_range(
                category=payload.get("category", "hanh-dong"),
                feed_type=feed_type,
                from_page=from_page,
                to_page=to_page,
                delay=payload.get("delay", 0.8),
                max_movies=payload.get("max_movies", 0),
                skip_existing=bool(payload.get("skip_existing", False)),
            )
            cache.set(
                cache_key,
                {
                    "job_id": job_id,
                    "status": "completed",
                    "summary": summary,
                    "updated_at": timezone.now().isoformat(),
                },
                timeout=3600,
            )
            cache.clear()
            actor = UserModel.objects.filter(id=actor_id).first() if actor_id else None
            _log_admin_action(
                actor,
                action="movie.sync",
                target_type="movie",
                target_id=f"{from_page}-{to_page}",
                metadata={"feed_type": feed_type, **summary},
            )
        except Exception as exc:
            logger.exception("Admin sync background job failed. job_id=%s", job_id)
            cache.set(
                cache_key,
                {
                    "job_id": job_id,
                    "status": "failed",
                    "error": str(exc),
                    "updated_at": timezone.now().isoformat(),
                },
                timeout=3600,
            )

    def post(self, request):
        payload = request.data or {}
        category = payload.get("category", "hanh-dong")
        feed_type = payload.get("feed_type", "the-loai")
        from_page = payload.get("from_page", 1)
        to_page = payload.get("to_page", 5)
        delay = payload.get("delay", 0.8)
        max_movies = payload.get("max_movies", 0)
        skip_existing = bool(payload.get("skip_existing", False))

        try:
            from_page = int(from_page)
            to_page = int(to_page)
            delay = max(float(delay), 0.5)
            max_movies = int(max_movies or 0)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid sync params."}, status=status.HTTP_400_BAD_REQUEST)

        if from_page > to_page:
            return Response({"detail": "from_page must be <= to_page"}, status=status.HTTP_400_BAD_REQUEST)

        normalized_payload = {
            "category": category,
            "feed_type": feed_type,
            "from_page": from_page,
            "to_page": to_page,
            "delay": delay,
            "max_movies": max_movies,
            "skip_existing": skip_existing,
        }

        job_id = uuid.uuid4().hex
        cache.set(
            self._cache_key(job_id),
            {
                "job_id": job_id,
                "status": "running",
                "summary": None,
                "params": normalized_payload,
                "updated_at": timezone.now().isoformat(),
            },
            timeout=3600,
        )

        worker = threading.Thread(
            target=self._run_sync_job,
            kwargs={
                "job_id": job_id,
                "actor_id": request.user.id if request.user.is_authenticated else None,
                "payload": normalized_payload,
            },
            daemon=True,
        )
        worker.start()

        return Response(
            {"job_id": job_id, "status": "running", "detail": "Sync started in background."},
            status=status.HTTP_202_ACCEPTED,
        )


class AdminSyncJobStatusAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "sync.run"

    @staticmethod
    def _cache_key(job_id: str) -> str:
        return f"movie_sync_job_{job_id}"

    def get(self, request, job_id: str):
        payload = cache.get(self._cache_key(job_id))
        if not payload:
            return Response({"detail": "Sync job not found or expired."}, status=status.HTTP_404_NOT_FOUND)
        return Response(payload)


class MovieStreamOptionsAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        m3u8_url = (request.query_params.get("m3u8") or "").strip()
        if not m3u8_url:
            return Response({"detail": "Missing m3u8 query param."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            response = requests.get(m3u8_url, timeout=20)
            response.raise_for_status()
            content = response.text
        except requests.RequestException as exc:
            return Response({"detail": "Cannot fetch stream manifest.", "error": str(exc)}, status=502)

        options = {"auto": m3u8_url}
        lines = [line.strip() for line in content.splitlines() if line.strip()]

        for index, line in enumerate(lines):
            if not line.startswith("#EXT-X-STREAM-INF"):
                continue
            next_line = lines[index + 1] if index + 1 < len(lines) else ""
            if not next_line or next_line.startswith("#"):
                continue
            stream_url = urljoin(m3u8_url, next_line)
            upper_line = line.upper()

            label = None
            if "RESOLUTION=" in upper_line:
                try:
                    resolution_part = upper_line.split("RESOLUTION=")[1].split(",")[0]
                    height = int(resolution_part.split("X")[1])
                    if height >= 1000:
                        label = "1080p"
                    elif height >= 700:
                        label = "720p"
                    elif height >= 450:
                        label = "480p"
                except Exception:
                    label = None

            if label and label not in options:
                options[label] = stream_url

        if len(options) == 1:
            options["1080p"] = m3u8_url
            options["720p"] = m3u8_url
            options["480p"] = m3u8_url

        return Response({"options": options})


class CommentReportAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, comment_id: int):
        comment = MovieComment.objects.filter(id=comment_id).first()
        if not comment:
            return Response({"detail": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)
        reason = (request.data.get("reason") or "").strip()
        report = CommentReport.objects.create(comment=comment, reporter=request.user, reason=reason)
        return Response(CommentReportSerializer(report).data, status=status.HTTP_201_CREATED)


class AdminAnalyticsAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "analytics.view"

    def get(self, request):
        active_movies = Movie.objects.filter(is_deleted=False)
        deleted_movies = Movie.objects.filter(is_deleted=True)
        open_reports = CommentReport.objects.filter(status=CommentReport.STATUS_OPEN).count()
        total_comments = MovieComment.objects.count()
        total_ratings = MovieRating.objects.count()

        top_countries = (
            active_movies.values_list("country_tags", flat=True)[:500]
        )
        country_counter = Counter()
        for item in top_countries:
            for name in (item or "").strip("|").split("|"):
                if name:
                    country_counter[name] += 1

        top_genres = (
            active_movies.values_list("genre_tags", flat=True)[:500]
        )
        genre_counter = Counter()
        for item in top_genres:
            for name in (item or "").strip("|").split("|"):
                if name:
                    genre_counter[name] += 1

        monthly_logs = (
            AdminActivityLog.objects.extra(select={"month": "strftime('%%Y-%%m', created_at)"})
            .values("month")
            .annotate(total=Count("id"))
            .order_by("month")
        )

        return Response(
            {
                "stats": {
                    "total_movies": active_movies.count(),
                    "trashed_movies": deleted_movies.count(),
                    "total_comments": total_comments,
                    "total_ratings": total_ratings,
                    "open_reports": open_reports,
                },
                "charts": {
                    "top_countries": [{"label": k, "value": v} for k, v in country_counter.most_common(8)],
                    "top_genres": [{"label": k, "value": v} for k, v in genre_counter.most_common(8)],
                    "activity_by_month": list(monthly_logs),
                },
            }
        )


class AdminMovieListAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "movies.view"

    def get(self, request):
        include_deleted = request.query_params.get("include_deleted") == "1"
        search = (request.query_params.get("search") or "").strip()
        queryset = Movie.objects.all()
        if not include_deleted:
            queryset = queryset.filter(is_deleted=False)
        if search:
            queryset = queryset.filter(Q(name__icontains=search) | Q(slug__icontains=search))
        queryset = queryset.order_by("-updated_at")[:200]
        return Response(MovieSummarySerializer(queryset, many=True).data)


class AdminMovieTrashAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "movies.view"

    def get(self, request):
        queryset = Movie.objects.filter(is_deleted=True).order_by("-deleted_at")[:200]
        return Response(MovieSummarySerializer(queryset, many=True).data)


class AdminMovieBulkActionAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "movies.view"

    def post(self, request):
        action = (request.data.get("action") or "").strip()
        movie_ids = request.data.get("movie_ids") or []
        if not action or not isinstance(movie_ids, list) or not movie_ids:
            return Response({"detail": "action and movie_ids are required."}, status=status.HTTP_400_BAD_REQUEST)

        movies = Movie.objects.filter(id__in=movie_ids)
        affected = 0

        if action == "soft_delete":
            if not user_has_permission(request.user, "movies.bulk.soft_delete"):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            for movie in movies:
                if not movie.is_deleted:
                    movie.soft_delete(user=request.user)
                    affected += 1
        elif action == "restore":
            if not user_has_permission(request.user, "movies.bulk.restore"):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            for movie in movies:
                if movie.is_deleted:
                    movie.restore()
                    affected += 1
        elif action == "hard_delete":
            if not user_has_permission(request.user, "movies.bulk.hard_delete"):
                return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
            affected, _ = movies.delete()
        else:
            return Response({"detail": "Unsupported action."}, status=status.HTTP_400_BAD_REQUEST)

        cache.clear()
        _log_admin_action(
            request.user,
            action=f"movie.bulk.{action}",
            target_type="movie",
            target_id="bulk",
            metadata={"affected": affected, "movie_ids": movie_ids[:50]},
        )
        return Response({"affected": affected})


class AdminCategoryAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "categories.view"

    def get(self, request):
        queryset = MovieCategory.objects.all()
        return Response(MovieCategorySerializer(queryset, many=True).data)

    def post(self, request):
        if not user_has_permission(request.user, "categories.manage"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = MovieCategorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        _log_admin_action(request.user, "category.create", "category", category.id, serializer.data)
        return Response(MovieCategorySerializer(category).data, status=status.HTTP_201_CREATED)

    def patch(self, request):
        if not user_has_permission(request.user, "categories.manage"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        category_id = request.data.get("id")
        category = MovieCategory.objects.filter(id=category_id).first()
        if not category:
            return Response({"detail": "Category not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = MovieCategorySerializer(category, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _log_admin_action(request.user, "category.update", "category", category.id, serializer.data)
        return Response(serializer.data)

    def delete(self, request):
        if not user_has_permission(request.user, "categories.manage"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        category_id = request.data.get("id")
        category = MovieCategory.objects.filter(id=category_id).first()
        if not category:
            return Response({"detail": "Category not found."}, status=status.HTTP_404_NOT_FOUND)
        category.delete()
        _log_admin_action(request.user, "category.delete", "category", category_id, {})
        return Response(status=status.HTTP_204_NO_CONTENT)


class AdminHomepageConfigAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "homepage_config.view"

    def get(self, request):
        config, _ = HomepageConfig.objects.get_or_create(key="default")
        return Response(HomepageConfigSerializer(config).data)

    def post(self, request):
        if not user_has_permission(request.user, "homepage_config.manage"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        config, _ = HomepageConfig.objects.get_or_create(key="default")
        serializer = HomepageConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        _log_admin_action(request.user, "homepage_config.update", "homepage_config", config.id, serializer.data)
        cache.clear()
        return Response(serializer.data)


class AdminActivityLogAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "activity_logs.view"

    def get(self, request):
        queryset = AdminActivityLog.objects.select_related("actor").all()[:500]
        return Response(AdminActivityLogSerializer(queryset, many=True).data)


class AdminCommentReportManageAPIView(APIView):
    permission_classes = [HasMoviePermission]
    required_permission = "reports.view"

    def get(self, request):
        status_filter = (request.query_params.get("status") or "").strip()
        queryset = CommentReport.objects.select_related("comment", "reporter").all()
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return Response(CommentReportSerializer(queryset[:300], many=True).data)

    def post(self, request):
        if not user_has_permission(request.user, "reports.manage"):
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        report_id = request.data.get("report_id")
        status_value = (request.data.get("status") or "").strip()
        report = CommentReport.objects.filter(id=report_id).first()
        if not report:
            return Response({"detail": "Report not found."}, status=status.HTTP_404_NOT_FOUND)
        if status_value not in {CommentReport.STATUS_OPEN, CommentReport.STATUS_REVIEWED, CommentReport.STATUS_DISMISSED}:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        report.status = status_value
        report.reviewed_by = request.user
        report.reviewed_at = timezone.now()
        report.save(update_fields=["status", "reviewed_by", "reviewed_at"])
        _log_admin_action(request.user, "report.review", "comment_report", report.id, {"status": status_value})
        return Response(CommentReportSerializer(report).data)


class AdminPermissionMatrixAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = get_user_role(request.user)
        permissions = sorted(get_user_permissions(request.user))
        return Response({"role": role, "permissions": permissions})
