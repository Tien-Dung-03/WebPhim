import MainLayout from "./layouts/MainLayout";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import NotFoundPage from "./pages/NotFoundPage";
import MovieWatchPage from "./pages/MovieWatchPage";
import MovieDetailPage from "./pages/MovieDetailPage";
import AdminMoviePage from "./pages/AdminMoviePage";
import SearchPage from "./pages/SearchPage";

const routes = [
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "movies/:slug", element: <MovieDetailPage /> },
      { path: "watch/:slug", element: <MovieWatchPage /> },
      { path: "search", element: <SearchPage /> },
      { path: "admin/movies", element: <AdminMoviePage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "profile", element: <ProfilePage /> }
    ]
  },
  { path: "*", element: <NotFoundPage /> }
];

export default routes;
