import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <section className="not-found">
      <h1>404</h1>
      <p>Trang ban tim khong ton tai.</p>
      <Link to="/">Quay lai trang chu</Link>
    </section>
  );
}

export default NotFoundPage;
