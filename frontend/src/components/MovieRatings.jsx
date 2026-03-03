import { useState } from "react";
import { createMovieRating } from "../api/movies";
import { isLoggedIn } from "../authToken";

function MovieRatings({ slug, ratings, onRefresh, userRating }) {
  const [score, setScore] = useState(userRating?.score || 5);
  const [review, setReview] = useState(userRating?.review || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitRating = async (event) => {
    event.preventDefault();
    setError("");
    if (!isLoggedIn()) {
      setError("Vui long dang nhap de danh gia phim.");
      return;
    }
    setLoading(true);
    try {
      await createMovieRating(slug, { score, review });
      await onRefresh();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Khong gui duoc danh gia.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="comment-box">
      <h3>Danh gia</h3>
      {!isLoggedIn() && <p className="comment-note">Vui long dang nhap de danh gia phim.</p>}
      {isLoggedIn() && (
        <form onSubmit={submitRating} className="comment-form">
          <label htmlFor="rating-select">So sao</label>
          <select id="rating-select" value={score} onChange={(e) => setScore(Number(e.target.value))}>
            <option value={5}>5 sao</option>
            <option value={4}>4 sao</option>
            <option value={3}>3 sao</option>
            <option value={2}>2 sao</option>
            <option value={1}>1 sao</option>
          </select>
          <textarea
            placeholder="Nhap noi dung danh gia (khong bat buoc)..."
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
          <button type="submit" disabled={loading}>{loading ? "Dang gui..." : "Gui danh gia"}</button>
          {error && <p className="comment-error">{error}</p>}
        </form>
      )}

      <div className="comment-list">
        {ratings.length === 0 && <p>Chua co danh gia nao.</p>}
        {ratings.map((item) => (
          <article key={item.id} className="comment-item">
            <p className="comment-author">{item.user_display_name}</p>
            <p className="comment-rating">{item.score}/5</p>
            {item.review && <p>{item.review}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

export default MovieRatings;
