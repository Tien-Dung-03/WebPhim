import { useState } from "react";
import { createMovieComment } from "../api/movies";
import { isLoggedIn } from "../authToken";

function MovieComments({ slug, comments, onRefresh }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submitComment = async (event) => {
    event.preventDefault();
    setError("");
    if (!isLoggedIn()) {
      setError("Vui long dang nhap de binh luan.");
      return;
    }
    if (!content.trim()) return;

    setLoading(true);
    try {
      await createMovieComment(slug, { content });
      setContent("");
      await onRefresh();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Khong gui duoc binh luan.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="comment-box">
      <h3>Binh luan</h3>
      {!isLoggedIn() && <p className="comment-note">Vui long dang nhap de binh luan.</p>}
      {isLoggedIn() && (
        <form onSubmit={submitComment} className="comment-form">
          <textarea
            placeholder="Nhap binh luan..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <button type="submit" disabled={loading}>{loading ? "Dang gui..." : "Gui binh luan"}</button>
          {error && <p className="comment-error">{error}</p>}
        </form>
      )}

      <div className="comment-list">
        {comments.length === 0 && <p>Chua co binh luan nao.</p>}
        {comments.map((item) => (
          <article key={item.id} className="comment-item">
            <p className="comment-author">{item.user_display_name}</p>
            <p>{item.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default MovieComments;
