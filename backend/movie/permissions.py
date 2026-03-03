from rest_framework.permissions import BasePermission


ROLE_VIEWER = "viewer"
ROLE_MODERATOR = "moderator"
ROLE_EDITOR = "editor"
ROLE_ADMIN = "admin"

ALL_ADMIN_PERMISSIONS = {
    "analytics.view",
    "movies.view",
    "movies.bulk.soft_delete",
    "movies.bulk.restore",
    "movies.bulk.hard_delete",
    "categories.view",
    "categories.manage",
    "reports.view",
    "reports.manage",
    "homepage_config.view",
    "homepage_config.manage",
    "activity_logs.view",
    "sync.run",
}

ROLE_PERMISSION_MATRIX = {
    ROLE_VIEWER: {
        "analytics.view",
        "movies.view",
        "categories.view",
        "reports.view",
        "homepage_config.view",
        "activity_logs.view",
    },
    ROLE_MODERATOR: {
        "analytics.view",
        "movies.view",
        "categories.view",
        "reports.view",
        "reports.manage",
        "homepage_config.view",
        "activity_logs.view",
    },
    ROLE_EDITOR: {
        "analytics.view",
        "movies.view",
        "movies.bulk.soft_delete",
        "movies.bulk.restore",
        "categories.view",
        "categories.manage",
        "reports.view",
        "homepage_config.view",
        "homepage_config.manage",
        "activity_logs.view",
        "sync.run",
    },
    ROLE_ADMIN: set(ALL_ADMIN_PERMISSIONS),
}


def get_user_role(user) -> str:
    if not user or not user.is_authenticated:
        return ""
    if user.is_superuser:
        return ROLE_ADMIN
    role = (getattr(user, "role", "") or "").strip().lower()
    if role == "owner":
        return ROLE_EDITOR
    if role in ROLE_PERMISSION_MATRIX:
        return role
    return ""


def get_user_permissions(user) -> set[str]:
    role = get_user_role(user)
    return set(ROLE_PERMISSION_MATRIX.get(role, set()))


def user_has_permission(user, permission_code: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return permission_code in get_user_permissions(user)


class HasMoviePermission(BasePermission):
    permission_code = ""

    def has_permission(self, request, view):
        required = getattr(view, "required_permission", "") or self.permission_code
        if not required:
            return False
        return user_has_permission(request.user, required)


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return user_has_permission(request.user, "sync.run")


class IsAdminOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return user_has_permission(request.user, "movies.bulk.soft_delete")
