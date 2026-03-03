from django.contrib import admin
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


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "quality", "is_deleted", "source_modified", "updated_at")
    search_fields = ("name", "original_name", "slug", "director", "casts")
    list_filter = ("quality", "source_modified", "created_at")


@admin.register(MovieComment)
class MovieCommentAdmin(admin.ModelAdmin):
    list_display = ("movie", "user", "guest_name", "created_at")
    search_fields = ("movie__name", "user__fullname", "guest_name", "content")


@admin.register(MovieRating)
class MovieRatingAdmin(admin.ModelAdmin):
    list_display = ("movie", "user", "score", "updated_at")
    search_fields = ("movie__name", "user__fullname", "user__email", "review")


@admin.register(MovieFavorite)
class MovieFavoriteAdmin(admin.ModelAdmin):
    list_display = ("movie", "user", "created_at")
    search_fields = ("movie__name", "user__fullname", "user__email")


@admin.register(MovieWatchHistory)
class MovieWatchHistoryAdmin(admin.ModelAdmin):
    list_display = ("movie", "user", "episode_name", "watched_seconds", "last_watched_at")
    search_fields = ("movie__name", "user__fullname", "user__email", "episode_name")


@admin.register(MovieCategory)
class MovieCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_active", "updated_at")
    search_fields = ("name", "slug")


@admin.register(MovieCategoryAssignment)
class MovieCategoryAssignmentAdmin(admin.ModelAdmin):
    list_display = ("movie", "category", "assigned_at")
    search_fields = ("movie__name", "category__name")


@admin.register(CommentReport)
class CommentReportAdmin(admin.ModelAdmin):
    list_display = ("comment", "reporter", "status", "created_at")
    list_filter = ("status",)


@admin.register(HomepageConfig)
class HomepageConfigAdmin(admin.ModelAdmin):
    list_display = ("key", "featured_movie_slug", "updated_by", "updated_at")


@admin.register(AdminActivityLog)
class AdminActivityLogAdmin(admin.ModelAdmin):
    list_display = ("actor", "action", "target_type", "target_id", "created_at")
    search_fields = ("action", "target_type", "target_id")
