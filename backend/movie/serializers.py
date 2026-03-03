from rest_framework import serializers

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


class MovieListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = (
            "id",
            "source_id",
            "name",
            "slug",
            "original_name",
            "thumb_url",
            "poster_url",
            "quality",
            "language",
            "current_episode",
            "total_episodes",
            "duration",
            "genres",
            "countries",
            "years",
            "source_modified",
            "average_rating",
            "review_count",
        )


class MovieDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = "__all__"


class MovieSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Movie
        fields = (
            "id",
            "name",
            "original_name",
            "slug",
            "thumb_url",
            "poster_url",
            "description",
            "genres",
            "countries",
            "quality",
            "current_episode",
            "source_modified",
            "average_rating",
            "review_count",
            "is_deleted",
        )


class MovieCommentSerializer(serializers.ModelSerializer):
    user_display_name = serializers.SerializerMethodField()

    class Meta:
        model = MovieComment
        fields = (
            "id",
            "movie",
            "user",
            "guest_name",
            "user_display_name",
            "content",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "movie", "user", "created_at", "updated_at")

    def get_user_display_name(self, obj):
        if obj.user_id:
            return obj.user.fullname or obj.user.email
        return obj.guest_name or "Anonymous"

    def validate(self, attrs):
        content = (attrs.get("content") or "").strip()
        if not content:
            raise serializers.ValidationError({"content": "Comment cannot be empty."})
        return attrs


class MovieRatingSerializer(serializers.ModelSerializer):
    user_display_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MovieRating
        fields = (
            "id",
            "movie",
            "user",
            "user_display_name",
            "score",
            "review",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "movie", "user", "created_at", "updated_at")

    def get_user_display_name(self, obj):
        return obj.user.fullname or obj.user.email

    def validate_score(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Score must be between 1 and 5.")
        return value


class MovieFavoriteSerializer(serializers.ModelSerializer):
    movie = MovieSummarySerializer(read_only=True)

    class Meta:
        model = MovieFavorite
        fields = ("id", "movie", "created_at")


class MovieWatchHistorySerializer(serializers.ModelSerializer):
    movie = MovieSummarySerializer(read_only=True)

    class Meta:
        model = MovieWatchHistory
        fields = (
            "id",
            "movie",
            "episode_slug",
            "episode_name",
            "watched_seconds",
            "total_seconds",
            "last_watched_at",
        )


class MovieCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MovieCategory
        fields = "__all__"


class MovieCategoryAssignmentSerializer(serializers.ModelSerializer):
    category = MovieCategorySerializer(read_only=True)

    class Meta:
        model = MovieCategoryAssignment
        fields = ("id", "movie", "category", "assigned_at")


class CommentReportSerializer(serializers.ModelSerializer):
    comment_preview = serializers.CharField(source="comment.content", read_only=True)

    class Meta:
        model = CommentReport
        fields = (
            "id",
            "comment",
            "comment_preview",
            "reporter",
            "reason",
            "status",
            "reviewed_by",
            "reviewed_at",
            "created_at",
        )
        read_only_fields = ("id", "reporter", "reviewed_by", "reviewed_at", "created_at")


class HomepageConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomepageConfig
        fields = "__all__"
        read_only_fields = ("updated_by", "updated_at")


class AdminActivityLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = AdminActivityLog
        fields = ("id", "actor", "actor_name", "action", "target_type", "target_id", "metadata", "created_at")

    def get_actor_name(self, obj):
        if not obj.actor_id:
            return "System"
        return obj.actor.fullname or obj.actor.email
