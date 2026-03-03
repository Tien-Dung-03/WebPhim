import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyProfile, updateMyProfile } from "../api/auth";
import { getFavorites, getWatchHistory } from "../api/movies";

function ProfilePage() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [watchHistory, setWatchHistory] = useState([]);
  const [avatarFile, setAvatarFile] = useState(null);

  useEffect(() => {
    const formatDate = (dt) => {
      // convert ISO datetime to YYYY-MM-DD which <input type=date> requires
      if (!dt) return "";
      return dt.split("T")[0];
    };

    const loadProfile = async () => {
      try {
        const data = await getMyProfile();
        // normalize birthday before saving into state
        const user = { ...data.user };
        if (user.birthday) {
          user.birthday = formatDate(user.birthday);
        }
        setProfile(user);
        const [favoriteData, historyData] = await Promise.all([getFavorites(), getWatchHistory()]);
        setFavorites(favoriteData || []);
        setWatchHistory(historyData || []);
      } catch (error) {
        setMessage(error?.response?.data?.message || "Khong lay duoc thong tin tai khoan");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const onChange = (e) => {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      let birthday = profile.birthday;
      if (birthday && birthday.length === 10) {
        birthday = `${birthday}T00:00:00`;
      }
      const payload = new FormData();
      payload.append("fullname", profile.fullname || "");
      payload.append("phone_number", profile.phone_number || "");
      if (birthday) payload.append("birthday", birthday);
      if (avatarFile) payload.append("avatar", avatarFile);
      const data = await updateMyProfile(payload);
      if (data.user && data.user.birthday) {
        data.user.birthday = data.user.birthday.split("T")[0];
      }
      setProfile(data.user);
      setAvatarFile(null);
      setMessage(data.message || "Cap nhat thanh cong");
    } catch (error) {
      setMessage(error?.response?.data?.message || "Cap nhat that bai");
    }
  };

  if (loading) return <p>Dang tai du lieu...</p>;
  if (!profile) return <p>{message || "Ban can dang nhap de xem trang nay."}</p>;

  const resolveImage = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${apiBase}${url}`;
  };

  const avatarUrl = resolveImage(profile.avatar);
  const getWatchPercent = (item) => {
    const watched = Number(item?.watched_seconds || 0);
    const total = Number(item?.total_seconds || 0);
    if (!total || total <= 0) return null;
    return Math.max(0, Math.min(100, Math.round((watched / total) * 100)));
  };

  return (
    <section className="detail-limit">
      <section className="auth-box">
        <h2>Thong tin tai khoan</h2>
        {avatarUrl && <img className="profile-avatar" src={avatarUrl} alt={profile.fullname || "avatar"} />}
        <form onSubmit={onSubmit}>
          <label>Ho ten</label>
          <input name="fullname" value={profile.fullname || ""} onChange={onChange} />

          <label>So dien thoai</label>
          <input name="phone_number" value={profile.phone_number || ""} onChange={onChange} />

          <label>Ngay sinh</label>
          <input name="birthday" type="date" value={profile.birthday || ""} onChange={onChange} />

          <label>Avatar</label>
          <input
            name="avatar"
            type="file"
            accept="image/*"
            onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
          />

          <button type="submit">Luu thay doi</button>
        </form>
        {message && <p className="feedback">{message}</p>}
      </section>

      <section className="panel">
        <h3>Danh sach yeu thich</h3>
        {favorites.length === 0 && <p>Chua co phim yeu thich.</p>}
        <div className="profile-media-grid">
          {favorites.map((item) => (
            <article key={item.id} className="profile-media-card">
              <img src={resolveImage(item.movie.poster_url || item.movie.thumb_url)} alt={item.movie.name} />
              <div>
                <h4>{item.movie.name}</h4>
                <p>{(item.movie.genres || []).join(", ") || "Dang cap nhat the loai"}</p>
                <Link className="btn-outline" to={`/movies/${item.movie.slug}`}>Xem chi tiet</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Tiep tuc xem</h3>
        {watchHistory.length === 0 && <p>Chua co lich su xem.</p>}
        <div className="profile-media-grid">
          {watchHistory.map((item) => (
            <article key={item.id} className="profile-media-card">
              <img src={resolveImage(item.movie.poster_url || item.movie.thumb_url)} alt={item.movie.name} />
              <div>
                <h4>{item.movie.name}</h4>
                <p>{(item.movie.genres || []).join(", ") || "Dang cap nhat the loai"}</p>
                <p>{item.episode_name ? `Tap da xem: ${item.episode_name}` : "Tap gan nhat"}</p>
                {getWatchPercent(item) !== null && (
                  <p>Tien do da xem: {getWatchPercent(item)}%</p>
                )}
                <Link
                  className="btn-fill"
                  to={`/watch/${item.movie.slug}?episode_slug=${encodeURIComponent(item.episode_slug || "")}`}
                >
                  Xem tiep
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export default ProfilePage;
