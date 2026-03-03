import time

import requests
from django.utils.dateparse import parse_datetime
from unidecode import unidecode

from .models import Movie


SOURCE_MOVIE_API = "https://phim.nguonc.com/api/film/{slug}"
SOURCE_LIST_API = "https://phim.nguonc.com/api/films/the-loai/{category}?page={page}"
SOURCE_LATEST_LIST_API = "https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page={page}"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
}


def _normalize_text(value: str) -> str:
    return unidecode((value or "").strip()).lower()


def _build_tag_text(values: list[str]) -> str:
    normalized = [_normalize_text(value) for value in values if (value or "").strip()]
    unique_values = []
    for value in normalized:
        if value and value not in unique_values:
            unique_values.append(value)
    if not unique_values:
        return ""
    return "|" + "|".join(unique_values) + "|"


def _extract_category_lists(category_data: dict) -> dict:
    result = {
        "format_types": [],
        "genres": [],
        "countries": [],
        "years": [],
    }

    if not isinstance(category_data, dict):
        return result

    for item in category_data.values():
        group_name = _normalize_text((item or {}).get("group", {}).get("name", ""))
        names = [
            category_item.get("name", "").strip()
            for category_item in (item or {}).get("list", [])
            if category_item.get("name", "").strip()
        ]

        if "dinh dang" in group_name:
            result["format_types"] = names
        elif "the loai" in group_name:
            result["genres"] = names
        elif "quoc gia" in group_name:
            result["countries"] = names
        elif group_name == "nam":
            result["years"] = names

    return result


def parse_movie_payload(movie_data: dict) -> dict:
    category_data = movie_data.get("category") or {}
    category_lists = _extract_category_lists(category_data)

    return {
        "source_id": movie_data.get("id") or movie_data.get("slug", ""),
        "name": movie_data.get("name", ""),
        "slug": movie_data.get("slug", ""),
        "original_name": movie_data.get("original_name", ""),
        "thumb_url": movie_data.get("thumb_url", ""),
        "poster_url": movie_data.get("poster_url", ""),
        "description": movie_data.get("description", ""),
        "total_episodes": movie_data.get("total_episodes") or None,
        "current_episode": movie_data.get("current_episode", ""),
        "duration": movie_data.get("time", "") or "",
        "quality": movie_data.get("quality", "") or "",
        "language": movie_data.get("language", "") or "",
        "director": movie_data.get("director", "") or "",
        "casts": movie_data.get("casts", "") or "",
        "source_created": parse_datetime(movie_data.get("created", "")),
        "source_modified": parse_datetime(movie_data.get("modified", "")),
        "category_data": category_data,
        "episodes": movie_data.get("episodes") or [],
        "format_types": category_lists["format_types"],
        "genres": category_lists["genres"],
        "countries": category_lists["countries"],
        "years": category_lists["years"],
        "format_tags": _build_tag_text(category_lists["format_types"]),
        "genre_tags": _build_tag_text(category_lists["genres"]),
        "country_tags": _build_tag_text(category_lists["countries"]),
        "year_tags": _build_tag_text(category_lists["years"]),
    }


def _request_json(url: str, timeout: int = 25, max_retries: int = 3) -> dict:
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)

    last_error = None
    for attempt in range(max_retries):
        try:
            response = session.get(url, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as exc:
            last_error = exc
            if attempt < max_retries - 1:
                time.sleep(min(1.5 * (attempt + 1), 5))
                continue
            raise last_error

    raise RuntimeError("Unexpected request retry state.")


def fetch_source_movie(slug: str) -> dict:
    data = _request_json(SOURCE_MOVIE_API.format(slug=slug))
    movie_data = data.get("movie")
    if not movie_data:
        raise ValueError("NguonC API did not return movie data.")
    return movie_data


# def fetch_movie_list_page(page: int, category: str = "hanh-dong", feed_type: str = "the-loai") -> tuple[list[dict], dict]:
#     normalized_feed = _normalize_text(feed_type) or "the-loai"
#     if normalized_feed in {"latest", "latest-updated", "phim-moi-cap-nhat"}:
#         data = _request_json(SOURCE_LATEST_LIST_API.format(page=page))
#     else:
#         data = _request_json(SOURCE_LIST_API.format(category=category, page=page))
#     return data.get("items", []), data.get("paginate", {})

def fetch_movie_list_page(page: int, category: str = None, feed_type: str = "the-loai"):
    normalized_feed = _normalize_text(feed_type) or "the-loai"
    if normalized_feed in {"latest", "latest-updated", "phim-moi-cap-nhat"}:
        data = _request_json(SOURCE_LATEST_LIST_API.format(page=page))
    else:
        if not category:
            raise ValueError("Category is required for the-loai feed type")
        data = _request_json(SOURCE_LIST_API.format(category=category, page=page))
    return data.get("items", []), data.get("paginate", {})

def upsert_movie_from_source(movie_data: dict) -> Movie:
    parsed_payload = parse_movie_payload(movie_data)
    source_id = parsed_payload["source_id"]
    if not parsed_payload["slug"] or not source_id:
        raise ValueError("Movie source data is missing required fields: id/slug.")

    movie, _ = Movie.objects.update_or_create(
        source_id=source_id,
        defaults=parsed_payload,
    )
    return movie


def sync_movie_by_slug(slug: str) -> Movie:
    movie_data = fetch_source_movie(slug=slug)
    return upsert_movie_from_source(movie_data=movie_data)


def sync_movies_range(
    category: str = None,
    feed_type: str = "the-loai",
    from_page: int = 1,
    to_page: int = 5,
    delay: float = 0.8,
    max_movies: int = 0,
    skip_existing: bool = False,
) -> dict:
    from_page = int(from_page)
    to_page = int(to_page)
    delay = max(float(delay), 0.5)

    if from_page > to_page:
        raise ValueError("from_page must be <= to_page")

    summary = {
        "saved": 0,
        "skipped": 0,
        "failed": 0,
        "processed": 0,
        "pages": {"from": from_page, "to": to_page},
        "category": category,
        "feed_type": feed_type,
        "errors": [],
    }

    for page in range(from_page, to_page + 1):
        try:
            items, _ = fetch_movie_list_page(page=page, category=category, feed_type=feed_type)
        except Exception as exc:
            summary["failed"] += 1
            summary["errors"].append({"page": page, "error": str(exc)})
            continue

        for item in items:
            slug = (item or {}).get("slug", "").strip()
            if not slug:
                continue

            if skip_existing and Movie.objects.filter(slug=slug).exists():
                summary["skipped"] += 1
                continue

            try:
                sync_movie_by_slug(slug=slug)
                summary["saved"] += 1
            except Exception as exc:
                summary["failed"] += 1
                summary["errors"].append({"slug": slug, "error": str(exc)})

            summary["processed"] += 1
            if max_movies and summary["processed"] >= int(max_movies):
                return summary
            time.sleep(delay)

    return summary
