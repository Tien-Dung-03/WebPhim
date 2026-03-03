import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MovieCard from "../components/MovieCard";
import MovieComments from "../components/MovieComments";
import MovieRatings from "../components/MovieRatings";
import { getMovieComments, getMovieDetail, getMovieRatings, toggleFavorite } from "../api/movies";
import { getUser, isLoggedIn } from "../authToken";

function MovieDetailPage() {
  const { slug } = useParams();
  const [movie, setMovie] = useState(null);
  const [relatedMovies, setRelatedMovies] = useState([]);
  const [suggestedMovies, setSuggestedMovies] = useState([]);
  const [comments, setComments] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [userRating, setUserRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [message, setMessage] = useState("");
  const user = getUser();

  const fetchComments = async () => {
    const payload = await getMovieComments(slug);
    setComments(payload || []);
  };

  const fetchRatings = async () => {
    const payload = await getMovieRatings(slug);
    setRatings(payload || []);
    const mine = (payload || []).find((item) => item.user === user?.user_id);
    setUserRating(mine || null);
  };

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const payload = await getMovieDetail(slug);
      setMovie(payload?.movie || null);
      setRelatedMovies(payload?.related_movies || []);
      setSuggestedMovies(payload?.suggested_movies || []);
      setComments(payload?.comments || []);
      setRatings(payload?.ratings || []);
      setUserRating(payload?.user_rating || null);
      setIsFavorite(Boolean(payload?.is_favorite));
    } catch {
      setMovie(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [slug]);

  const description = useMemo(() => {
    const full = movie?.description || "";
    if (showFullDesc || full.length <= 320) return full;
    return `${full.slice(0, 320)}...`;
  }, [movie?.description, showFullDesc]);

  const episodes = movie?.episodes || [];

  if (loading) return <p>Dang tai chi tiet phim...</p>;
  if (!movie) return <p>Khong tim thay phim.</p>;

  const handleFavorite = async () => {
    if (!isLoggedIn()) {
      setMessage("Vui long dang nhap de them vao danh sach.");
      return;
    }
    const result = await toggleFavorite(movie.slug);
    setIsFavorite(Boolean(result?.is_favorite));
    setMessage(result?.is_favorite ? "Da them vao yeu thich." : "Da bo khoi yeu thich.");
  };

  return (
    <section className="detail-page detail-limit" style={{ gridAutoColumns: "100% 1fr" }}>
      <section className="detail-backdrop" style={{ backgroundImage: `url(${movie.poster_url || movie.thumb_url})` }}>
        <div className="detail-backdrop-overlay">
          <img src={movie.poster_url || movie.thumb_url} alt={movie.name} />
          <div>
            <h1>{movie.name}</h1>
            <p className="subtle-text">{movie.original_name}</p>
            <p>
              <strong>{movie.average_rating || 0}/5</strong> ({movie.review_count || 0} danh gia)
            </p>
            <p>The loai: {(movie.genres || []).join(", ") || "Dang cap nhat"}</p>
            <p>Thoi luong: {movie.duration || "Dang cap nhat"}</p>
            <p>Quoc gia: {(movie.countries || []).join(", ") || "Dang cap nhat"}</p>
            <p>Nam: {(movie.years || []).join(", ") || "Dang cap nhat"}</p>
            <p>Dien vien: {movie.casts || "Dang cap nhat"}</p>
            <p>Dao dien: {movie.director || "Dang cap nhat"}</p>
            <div className="detail-actions">
              <Link to={`/watch/${movie.slug}`} className="btn-fill">Xem phim</Link>
              <button type="button" className="btn-outline" onClick={handleFavorite}>
                {isFavorite ? "Bo yeu thich" : "Them vao danh sach"}
              </button>
            </div>
            {message && <p className="feedback">{message}</p>}
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Noi dung phim</h3>
        <p>{description || "Dang cap nhat mo ta."}</p>
        {(movie.description || "").length > 320 && (
          <button type="button" className="btn-outline" onClick={() => setShowFullDesc((prev) => !prev)}>
            {showFullDesc ? "Thu gon" : "Xem them"}
          </button>
        )}
      </section>

      <MovieRatings slug={slug} ratings={ratings} onRefresh={fetchRatings} userRating={userRating} />
      <MovieComments slug={slug} comments={comments} onRefresh={fetchComments} />

      <section className="home-section">
        <h2 className="section-title">Phim tuong tu</h2>
        <div className="movie-row">
          {relatedMovies.map((item) => (
            <div className="movie-row-item" key={item.id}>
              <MovieCard movie={item} />
            </div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2 className="section-title">Ban co the thich</h2>
        <div className="movie-row">
          {suggestedMovies.map((item) => (
            <div className="movie-row-item" key={item.id}>
              <MovieCard movie={item} />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

export default MovieDetailPage;
