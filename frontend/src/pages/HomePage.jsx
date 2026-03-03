import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import MovieCard from "../components/MovieCard";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { getMovieFilterOptions, getMovieHome, getMovies, toggleFavorite } from "../api/movies";
import { isLoggedIn } from "../authToken";

function HorizontalSection({ title, movies }) {
  const rowRef = useRef(null);

  // const scroll = (direction) => {
  //   if (!rowRef.current) return;
  //   const card = rowRef.current.querySelector(".movie-row-item");
  //   if (!card) return;

  //   const cardWidth = card.offsetWidth + 16;
  //   rowRef.current.scrollBy({
  //     left: direction === "left" ? -cardWidth : cardWidth,
  //     behavior: "smooth",
  //   });
  // };

  return (
    <section className="home-section">
      <h2 className="section-title">{title}</h2>

      <div className="movie-row-wrapper">
        {/* <button
          className="nav-btn nav-left"
          onClick={() => scroll("left")}
        >
          <FaChevronLeft />
        </button> */}

        <div className="movie-row" ref={rowRef}>
          {movies.map((movie) => (
            <div className="movie-row-item" key={movie.id}>
              <MovieCard movie={movie} />
            </div>
          ))}
        </div>

        {/* <button
          className="nav-btn nav-right"
          onClick={() => scroll("right")}
        >
          <FaChevronRight />
        </button> */}
      </div>
    </section>
  );
}

function HeroBanner({ movie, onFavorite }) {
  if (!movie) return null;
  const backdrop = movie.poster_url || movie.thumb_url;
  return (
    <section className="hero-banner" style={{ backgroundImage: `url(${backdrop})` }}>
      <div className="hero-overlay">
        <span className="hero-badge">Featured Movie</span>
        <h1>{movie.name}</h1>
        <p>{movie.description?.slice(0, 180)}...</p>
        <div className="hero-actions">
          <Link to={`/watch/${movie.slug}`} className="btn-fill">Xem ngay</Link>
          <button type="button" className="btn-outline" onClick={() => onFavorite(movie.slug)}>
            Them vao danh sach
          </button>
        </div>
      </div>
    </section>
  );
}

function SkeletonRows() {
  return (
    <section className="home-section">
      <div className="skeleton-title" />
      <div className="movie-row">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="movie-row-item" key={index}>
            <div className="skeleton-card" />
          </div>
        ))}
      </div>
    </section>
  );
}

function HomePage() {
  const [homeData, setHomeData] = useState(null);
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
  const [years, setYears] = useState([]);
  const [genre, setGenre] = useState("");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState("");
  const [latestOnly, setLatestOnly] = useState(false);
  const [filteredMovies, setFilteredMovies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function bootstrapHome() {
      setLoading(true);
      try {
        const [homePayload, optionPayload] = await Promise.all([getMovieHome(), getMovieFilterOptions()]);
        setHomeData(homePayload || null);
        setGenres(optionPayload?.genres || []);
        setCountries(optionPayload?.countries || []);
        setYears(optionPayload?.years || []);
      } finally {
        setLoading(false);
      }
    }
    bootstrapHome();
  }, []);

  const handleAddFavorite = async (slug) => {
    if (!isLoggedIn()) {
      setMessage("Vui long dang nhap de them vao danh sach.");
      return;
    }
    await toggleFavorite(slug);
    setMessage("Da cap nhat danh sach yeu thich.");
  };

  const rows = useMemo(() => {
    if (!homeData) return [];
    return [
      { title: "Phim moi cap nhat", movies: homeData.latest_updated || [] },
      { title: "Trending hom nay", movies: homeData.trending_today || [] },
      { title: "Phim hanh dong", movies: homeData.action_movies || [] },
      { title: "Phim Trung Quoc", movies: homeData.china_movies || [] },
      { title: "Phim de xuat cho ban", movies: homeData.recommended_for_you || [] },
    ];
  }, [homeData]);

  const handleFilter = async (event) => {
    event.preventDefault();
    setFilterLoading(true);
    try {
      const payload = await getMovies({
        genre: genre || undefined,
        country: country || undefined,
        year: year || undefined,
        ordering: latestOnly ? "-source_modified" : undefined,
        limit: 24,
      });
      setFilteredMovies(payload?.results || []);
    } finally {
      setFilterLoading(false);
    }
  };

  const handleResetFilter = () => {
    setGenre("");
    setCountry("");
    setYear("");
    setLatestOnly(false);
    setFilteredMovies([]);
  };

  return (
    <section>
      <HeroBanner movie={homeData?.featured_movie} onFavorite={handleAddFavorite} />
      {message && <p className="feedback">{message}</p>}

      <form className="filter-form" onSubmit={handleFilter}>
        <select value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="">Loc theo the loai</option>
          {genres.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Loc theo quoc gia</option>
          {countries.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Loc theo nam</option>
          {years.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <label className="inline-checkbox">
          <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} />
          Phim moi cap nhat
        </label>
        <button type="submit" className="btn-fill">{filterLoading ? "Dang loc..." : "Tim kiem"}</button>
        <button type="button" className="btn-outline" onClick={handleResetFilter}>Xoa loc</button>
      </form>

      {loading && (
        <>
          <SkeletonRows />
          <SkeletonRows />
        </>
      )}

      {!loading && filteredMovies.length === 0 && rows.map((row) => (
        <HorizontalSection key={row.title} title={row.title} movies={row.movies} />
      ))}

      {filteredMovies.length > 0 && (
        <section className="home-section">
          <h2 className="section-title">Ket qua loc tren trang chu</h2>
          <div className="movie-grid">
            {filteredMovies.map((movie) => (
              <MovieCard key={`${movie.id}-${movie.slug}`} movie={movie} />
            ))}
          </div>
        </section>
      )}

    </section>
  );
}

export default HomePage;
