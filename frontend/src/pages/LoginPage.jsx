import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, loginGoogle } from "../api/auth";
import { setAuth } from "../authToken";

function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await login(form);
      setAuth(data);
      setMessage(data.message || "Dang nhap thanh cong");
      navigate("/profile");
    } catch (error) {
      setMessage(error?.response?.data?.message || "Dang nhap that bai");
    } finally {
      setLoading(false);
    }
  };

  // callback invoked by google script
  const handleGoogleResponse = async (response) => {
    if (!response?.credential) return;
    setLoading(true);
    try {
      const data = await loginGoogle({ token: response.credential });
      setAuth(data);
      setMessage(data.message || "Dang nhap bang Google thanh cong");
      navigate("/profile");
    } catch (error) {
      setMessage(error?.response?.data?.message || "Dang nhap bang Google that bai");
    } finally {
      setLoading(false);
    }
  };

  // load google identity script and render button
  useEffect(() => {
    window.handleGoogleResponse = handleGoogleResponse; // expose for callback
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);

    script.onload = () => {
      /* global google */
      google.accounts.id.initialize({
        // Vite exposes env vars via import.meta.env
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      google.accounts.id.renderButton(
        document.getElementById("google-signin"),
        { theme: "outline", size: "large" }
      );
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <section className="auth-box">
      <h2>Dang nhap</h2>
      <form onSubmit={onSubmit}>
        <label>Email</label>
        <input name="email" type="email" onChange={onChange} required />

        <label>Mat khau</label>
        <input name="password" type="password" onChange={onChange} required />

        <button disabled={loading} type="submit">
          {loading ? "Dang xu ly..." : "Dang nhap"}
        </button>
      </form>

      <div id="google-signin" style={{ marginTop: 20 }}></div>
      {message && <p className="feedback">{message}</p>}
    </section>
  );
}

export default LoginPage;
