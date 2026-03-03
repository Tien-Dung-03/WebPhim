import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearAuth, getRefreshToken, getUser, isLoggedIn } from "../authToken";
import { logout } from "../api/auth";

function MainLayout() {
  const navigate = useNavigate();
  const user = getUser();
  const canAccessAdmin = ["viewer", "moderator", "editor", "admin"].includes((user?.role || "").toLowerCase());
  const [keyword, setKeyword] = useState("");
  const [openMenu, setOpenMenu] = useState(false);

  const handleLogout = async () => {
    try {
      const refresh = getRefreshToken();
      if (refresh) await logout(refresh);
    } catch {
    } finally {
      clearAuth();
      navigate("/login");
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(keyword)}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">MOVIE HUB</Link>
        <nav className="nav-links">
          <NavLink to="/">Trang chu</NavLink>
          <NavLink to="/search?ordering=-source_modified">Phim moi cap nhat</NavLink>
          <NavLink to="/search?country=Trung%20Quoc">Trung Quoc</NavLink>
          {canAccessAdmin && <NavLink to="/admin/movies">Quan ly phim</NavLink>}
        </nav>
        <form className="topbar-search" onSubmit={handleSearch}>
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tim kiem..."
          />
          <button type="submit">Tim</button>
        </form>
        <div className="user-dropdown">
          <button type="button" className="avatar-btn" onClick={() => setOpenMenu((prev) => !prev)}>
            {user?.fullname?.[0]?.toUpperCase() || "U"}
          </button>
          {openMenu && (
            <div className="dropdown-menu">
              <NavLink to="/profile">Profile</NavLink>
              {!isLoggedIn() && <NavLink to="/login">Dang nhap</NavLink>}
              {!isLoggedIn() && <NavLink to="/register">Dang ky</NavLink>}
              {isLoggedIn() && <button type="button" onClick={handleLogout}>Dang xuat</button>}
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        {user && <p className="welcome">Xin chao, {user.fullname || user.email}</p>}
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;
