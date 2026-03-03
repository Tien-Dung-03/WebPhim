from django.core.management.base import BaseCommand

from movie.services import sync_movies_range


class Command(BaseCommand):
    help = "Sync movies from NguonC API into local SQLite."

    def add_arguments(self, parser):
        parser.add_argument(
            "--feed-type",
            type=str,
            default="the-loai",
            choices=["the-loai", "phim-moi-cap-nhat"],
            help="Nguon list phim: the-loai hoac phim-moi-cap-nhat",
        )
        parser.add_argument("--category", type=str, default="hanh-dong")
        parser.add_argument("--from-page", type=int, default=1)
        parser.add_argument("--to-page", type=int, default=5)
        parser.add_argument("--delay", type=float, default=0.8)
        parser.add_argument("--max-movies", type=int, default=0)
        parser.add_argument("--skip-existing", action="store_true")

    def handle(self, *args, **options):
        feed_type = options["feed_type"]
        category = options["category"] if feed_type == "the-loai" else None
        from_page = options["from_page"]
        to_page = options["to_page"]
        delay = max(options["delay"], 0.5)
        max_movies = options["max_movies"]
        skip_existing = options["skip_existing"]

        self.stdout.write(
            f"Start syncing feed='{feed_type}', category='{category}', pages={from_page}-{to_page}, delay={delay}s"
        )

        summary = sync_movies_range(
            category=category,
            feed_type=feed_type,
            from_page=from_page,
            to_page=to_page,
            delay=delay,
            max_movies=max_movies,
            skip_existing=skip_existing,
        )

        for error in summary["errors"]:
            if "page" in error:
                self.stderr.write(self.style.WARNING(f"Page {error['page']} failed: {error['error']}"))
            else:
                self.stderr.write(self.style.WARNING(f"[{error['slug']}] failed: {error['error']}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. saved={summary['saved']}, skipped={summary['skipped']}, failed={summary['failed']}, processed={summary['processed']}"
            )
        )
