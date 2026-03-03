"""
URL configuration for backend project.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from user.api.views import AdminManagerUserAPIViewSet

router_admin = DefaultRouter()
router_admin.register(r"requests", AdminManagerUserAPIViewSet, basename="admin-request")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("user/api/", include("user.api.urls")),
    path("movie/api/", include("movie.urls")),
    path("user-admin/api/", include(router_admin.urls)),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
