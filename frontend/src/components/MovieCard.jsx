import { Link } from "react-router-dom";

// function truncateText(text, maxLength = 90) {
//   const value = (text || "").trim();
//   if (!value) return "Dang cap nhat mo ta.";
//   if (value.length <= maxLength) return value;
//   return `${value.slice(0, maxLength)}...`;
// }

function MovieCard({ movie }) {
  const title = movie.name || movie.title;
  const title2 = movie.original_name || movie.original_title;
  const poster = movie.poster_url || movie.thumb_url || "";
  const genres = Array.isArray(movie.genres) ? movie.genres.join(", ") : "";

  return (
    <article className="movie-card">
      <img src={poster} alt={title} loading="lazy" />
      <div className="movie-meta">
        <h3>{title}</h3>
        {title2 && <p className="subtle-text">{title2}</p>}
        {/* <p className="movie-desc">{truncateText(movie.description)}</p> */}
        <p className="movie-tags">{genres || "Dang cap nhat the loai"}</p>
        <p className="movie-rating">
          {movie.average_rating ? `${movie.average_rating}/5` : "Chua co danh gia"} ({movie.review_count || 0})
        </p>
        <div className="movie-actions">
          <Link to={`/movies/${movie.slug}`} className="btn-outline">Xem chi tiet</Link>
          <Link to={`/watch/${movie.slug}`} className="btn-fill">Xem phim</Link>
        </div>
      </div>
    </article>
  );
}

export default MovieCard;
