import { useState } from "react";
import { register } from "../api/auth";

function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    fullname: "",
    password: "",
    password2: ""
  });
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
      const data = await register(form);
      setMessage(data.message || "Dang ky thanh cong, hay kiem tra email de xac thuc.");
    } catch (error) {
      const backendMessage = error?.response?.data?.message;
      const backendErrors = error?.response?.data?.errors;
      if (backendErrors && typeof backendErrors === "object") {
        const lines = Object.entries(backendErrors)
          .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(", ") : value}`);
        setMessage(lines.join(" | "));
      } else {
        setMessage(backendMessage || "Dang ky that bai");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-box">
      <h2>Dang ky</h2>
      <form onSubmit={onSubmit}>
        <label>Ho ten</label>
        <input name="fullname" type="text" onChange={onChange} required />

        <label>Email</label>
        <input name="email" type="email" onChange={onChange} required />

        <label>Mat khau</label>
        <input name="password" type="password" onChange={onChange} required />

        <label>Nhap lai mat khau</label>
        <input name="password2" type="password" onChange={onChange} required />

        <button disabled={loading} type="submit">
          {loading ? "Dang xu ly..." : "Tao tai khoan"}
        </button>
      </form>
      {message && <p className="feedback">{message}</p>}
    </section>
  );
}

export default RegisterPage;
