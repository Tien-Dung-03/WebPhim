import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import MovieCard from "../components/MovieCard";
import { getMovieFilterOptions, getMovies } from "../api/movies";

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
  const [years, setYears] = useState([]);
  const [items, setItems] = useState([]);
  const [nextPage, setNextPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const filters = useMemo(
    () => ({
      search: searchParams.get("q") || "",
      genre: searchParams.get("genre") || "",
      country: searchParams.get("country") || "",
      year: searchParams.get("year") || "",
      min_rating: searchParams.get("min_rating") || "",
      format: searchParams.get("format") || "",
      ordering: searchParams.get("ordering") || "",
    }),
    [searchParams]
  );
  const hasCriteria = Boolean(
    filters.search || filters.genre || filters.country || filters.year || filters.min_rating || filters.format || filters.ordering
  );

  const fetchPage = async (page = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await getMovies({
        search: filters.search || undefined,
        genre: filters.genre || undefined,
        country: filters.country || undefined,
        year: filters.year || undefined,
        min_rating: filters.min_rating || undefined,
        format: filters.format || undefined,
        ordering: filters.ordering || "-source_modified",
        page,
      });
      setItems((prev) => (append ? [...prev, ...(data?.results || [])] : (data?.results || [])));
      if (data?.next) {
        const parsed = new URL(data.next);
        setNextPage(Number(parsed.searchParams.get("page")));
      } else {
        setNextPage(null);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    getMovieFilterOptions().then((payload) => {
      setGenres(payload?.genres || []);
      setCountries(payload?.countries || []);
      setYears(payload?.years || []);
    });
  }, []);

  useEffect(() => {
    if (!hasCriteria) {
      setItems([]);
      setNextPage(null);
      return;
    }
    fetchPage(1, false);
  }, [hasCriteria, filters.search, filters.genre, filters.country, filters.year, filters.min_rating, filters.format, filters.ordering]);

  useEffect(() => {
    const onScroll = () => {
      if (loadingMore || loading || !nextPage) return;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
      if (nearBottom) fetchPage(nextPage, true);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [loadingMore, loading, nextPage, filters]);

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  return (
    <section className="detail-limit">
      <h1>Ket qua tim kiem</h1>
      <div className="filter-form">
        <input value={filters.search} onChange={(e) => updateFilter("q", e.target.value)} placeholder="Ten phim..." />
        <select value={filters.genre} onChange={(e) => updateFilter("genre", e.target.value)}>
          <option value="">The loai</option>
          {genres.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.country} onChange={(e) => updateFilter("country", e.target.value)}>
          <option value="">Quoc gia</option>
          {countries.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.year} onChange={(e) => updateFilter("year", e.target.value)}>
          <option value="">Nam</option>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={filters.min_rating} onChange={(e) => updateFilter("min_rating", e.target.value)}>
          <option value="">Rating</option>
          <option value="5">5+</option>
          <option value="4">4+</option>
          <option value="3">3+</option>
          <option value="2">2+</option>
          <option value="1">1+</option>
        </select>
        <select value={filters.format} onChange={(e) => updateFilter("format", e.target.value)}>
          <option value="">Dang phim</option>
          <option value="Phim le">Phim le</option>
          <option value="Phim bo">Phim bo</option>
        </select>
      </div>

      {!hasCriteria && <p>Nhap tu khoa hoac chon bo loc de tim phim.</p>}
      {hasCriteria && loading && <p>Dang tim phim...</p>}
      <div className="movie-grid">
        {items.map((movie) => <MovieCard key={`${movie.id}-${movie.slug}`} movie={movie} />)}
      </div>
      {loadingMore && <p>Dang tai them...</p>}
      {hasCriteria && !loading && items.length === 0 && <p>Khong tim thay phim phu hop.</p>}
    </section>
  );
}

export default SearchPage;
