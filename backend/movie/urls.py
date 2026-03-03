from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminActivityLogAPIView,
    AdminAnalyticsAPIView,
    AdminCategoryAPIView,
    AdminCommentReportManageAPIView,
    AdminHomepageConfigAPIView,
    AdminMovieBulkActionAPIView,
    AdminMovieListAPIView,
    MovieAdminSyncAPIView,
    AdminMovieTrashAPIView,
    AdminPermissionMatrixAPIView,
    AdminSyncJobStatusAPIView,
    CommentReportAPIView,
    MovieCommentsAPIView,
    MovieFavoriteToggleAPIView,
    MovieFavoritesAPIView,
    MovieFilterOptionsAPIView,
    MovieHomeAPIView,
    MovieRatingsAPIView,
    MovieSyncAPIView,
    MovieStreamOptionsAPIView,
    MovieViewSet,
    MovieWatchHistoryAPIView,
)

router = DefaultRouter(trailing_slash=False)
router.register(r"movies", MovieViewSet, basename="movies")

urlpatterns = [
    path("home", MovieHomeAPIView.as_view(), name="movie-home"),
    path("filter-options", MovieFilterOptionsAPIView.as_view(), name="movie-filter-options"),
    path("movies/<slug:slug>/comments", MovieCommentsAPIView.as_view(), name="movie-comments"),
    path("movies/<slug:slug>/ratings", MovieRatingsAPIView.as_view(), name="movie-ratings"),
    path("movies/<slug:slug>/favorite", MovieFavoriteToggleAPIView.as_view(), name="movie-favorite"),
    path("comments/<int:comment_id>/report", CommentReportAPIView.as_view(), name="movie-comment-report"),
    path("favorites", MovieFavoritesAPIView.as_view(), name="movie-favorites"),
    path("watch-history", MovieWatchHistoryAPIView.as_view(), name="movie-watch-history"),
    path("stream-options", MovieStreamOptionsAPIView.as_view(), name="movie-stream-options"),
    path("admin/analytics", AdminAnalyticsAPIView.as_view(), name="movie-admin-analytics"),
    path("admin/movies", AdminMovieListAPIView.as_view(), name="movie-admin-movies"),
    path("admin/movies/trash", AdminMovieTrashAPIView.as_view(), name="movie-admin-movies-trash"),
    path("admin/movies/bulk-action", AdminMovieBulkActionAPIView.as_view(), name="movie-admin-movies-bulk-action"),
    path("admin/categories", AdminCategoryAPIView.as_view(), name="movie-admin-categories"),
    path("admin/homepage-config", AdminHomepageConfigAPIView.as_view(), name="movie-admin-homepage-config"),
    path("admin/activity-logs", AdminActivityLogAPIView.as_view(), name="movie-admin-activity-logs"),
    path("admin/comment-reports", AdminCommentReportManageAPIView.as_view(), name="movie-admin-comment-reports"),
    path("admin/permissions", AdminPermissionMatrixAPIView.as_view(), name="movie-admin-permissions"),
    path("admin/sync", MovieAdminSyncAPIView.as_view(), name="movie-admin-sync"),
    path("admin/sync/<str:job_id>", AdminSyncJobStatusAPIView.as_view(), name="movie-admin-sync-status"),
    path("sync/<slug:slug>", MovieSyncAPIView.as_view(), name="movie-sync"),
    path("", include(router.urls)),
]
