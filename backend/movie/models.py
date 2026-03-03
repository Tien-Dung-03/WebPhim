from django.db import models
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.utils import timezone


class Movie(models.Model):
    source_id = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255, db_index=True)
    slug = models.SlugField(max_length=255, unique=True)
    original_name = models.CharField(max_length=255, blank=True, default="")

    thumb_url = models.URLField(max_length=500, blank=True, default="")
    poster_url = models.URLField(max_length=500, blank=True, default="")

    description = models.TextField(blank=True, default="")
    total_episodes = models.PositiveIntegerField(null=True, blank=True)
    current_episode = models.CharField(max_length=100, blank=True, default="")
    duration = models.CharField(max_length=100, blank=True, default="")
    quality = models.CharField(max_length=50, blank=True, default="", db_index=True)
    language = models.CharField(max_length=100, blank=True, default="")
    director = models.CharField(max_length=255, blank=True, default="")
    casts = models.TextField(blank=True, default="")

    source_created = models.DateTimeField(null=True, blank=True)
    source_modified = models.DateTimeField(null=True, blank=True, db_index=True)

    category_data = models.JSONField(default=dict, blank=True)
    episodes = models.JSONField(default=list, blank=True)

    format_types = models.JSONField(default=list, blank=True)
    genres = models.JSONField(default=list, blank=True)
    countries = models.JSONField(default=list, blank=True)
    years = models.JSONField(default=list, blank=True)

    format_tags = models.TextField(blank=True, default="", db_index=True)
    genre_tags = models.TextField(blank=True, default="", db_index=True)
    country_tags = models.TextField(blank=True, default="", db_index=True)
    year_tags = models.TextField(blank=True, default="", db_index=True)
    average_rating = models.FloatField(default=0)
    review_count = models.PositiveIntegerField(default=0)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_movies",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-source_modified", "-updated_at"]

    def __str__(self):
        return self.name

    def soft_delete(self, user=None):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_at"])

    def restore(self):
        self.is_deleted = False
        self.deleted_at = None
        self.deleted_by = None
        self.save(update_fields=["is_deleted", "deleted_at", "deleted_by", "updated_at"])


class MovieComment(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="movie_comments",
    )
    guest_name = models.CharField(max_length=120, blank=True, default="")
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        display_name = self.user.fullname if self.user_id else self.guest_name
        return f"{display_name or 'Anonymous'} - {self.movie.name}"


class MovieRating(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="ratings")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="movie_ratings",
    )
    score = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    review = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
        unique_together = ("movie", "user")

    def __str__(self):
        return f"{self.user_id} rated {self.movie.name}: {self.score}"


class MovieFavorite(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="favorites")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="movie_favorites",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("movie", "user")
        ordering = ["-created_at"]


class MovieWatchHistory(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="watch_histories")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="movie_watch_histories",
    )
    episode_slug = models.CharField(max_length=255, blank=True, default="")
    episode_name = models.CharField(max_length=100, blank=True, default="")
    watched_seconds = models.PositiveIntegerField(default=0)
    total_seconds = models.PositiveIntegerField(default=0)
    last_watched_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("movie", "user")
        ordering = ["-last_watched_at"]


class MovieCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class MovieCategoryAssignment(models.Model):
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="category_assignments")
    category = models.ForeignKey(MovieCategory, on_delete=models.CASCADE, related_name="movie_assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("movie", "category")


class CommentReport(models.Model):
    STATUS_OPEN = "open"
    STATUS_REVIEWED = "reviewed"
    STATUS_DISMISSED = "dismissed"
    STATUS_CHOICES = (
        (STATUS_OPEN, "Open"),
        (STATUS_REVIEWED, "Reviewed"),
        (STATUS_DISMISSED, "Dismissed"),
    )

    comment = models.ForeignKey(MovieComment, on_delete=models.CASCADE, related_name="reports")
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comment_reports",
    )
    reason = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_comment_reports",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class HomepageConfig(models.Model):
    key = models.CharField(max_length=50, unique=True, default="default")
    featured_movie_slug = models.CharField(max_length=255, blank=True, default="")
    sections = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="homepage_configs_updated",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]


class AdminActivityLog(models.Model):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_activity_logs",
    )
    action = models.CharField(max_length=120, db_index=True)
    target_type = models.CharField(max_length=80, blank=True, default="")
    target_id = models.CharField(max_length=120, blank=True, default="")
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
