import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useParams } from "react-router-dom";
import Hls from "hls.js";
import MovieComments from "../components/MovieComments";
import MovieRatings from "../components/MovieRatings";
import { getMovieComments, getMovieDetail, getMovieRatings, getStreamOptions, saveWatchHistory } from "../api/movies";
import { getUser, isLoggedIn } from "../authToken";

function MovieWatchPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverIndex, setServerIndex] = useState(0);
  const [episodeIndex, setEpisodeIndex] = useState(0);
  const [comments, setComments] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [userRating, setUserRating] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [autoNext, setAutoNext] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [streamOptions, setStreamOptions] = useState({});
  const [preferEmbed, setPreferEmbed] = useState(true);
  const user = getUser();
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const lastSavedSecondRef = useRef(0);

  const fetchComments = async () => {
    const payload = await getMovieComments(slug);
    setComments(payload || []);
  };

  const fetchRatings = async () => {
    const payload = await getMovieRatings(slug);
    setRatings(payload || []);
    const myRating = (payload || []).find((item) => item.user === user?.user_id);
    setUserRating(myRating || null);
  };

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      try {
        const payload = await getMovieDetail(slug);
        const movieData = payload?.movie || null;
        setMovie(movieData);
        const queryEpisodeSlug = (searchParams.get("episode_slug") || "").trim();
        let matchedServerIndex = -1;
        let matchedEpisodeIndex = -1;

        if (queryEpisodeSlug && movieData?.episodes?.length) {
          movieData.episodes.forEach((server, sIdx) => {
            (server.items || []).forEach((episode, eIdx) => {
              if (matchedServerIndex === -1 && (episode.slug || "") === queryEpisodeSlug) {
                matchedServerIndex = sIdx;
                matchedEpisodeIndex = eIdx;
              }
            });
          });
        }

        if (matchedServerIndex >= 0 && matchedEpisodeIndex >= 0) {
          setServerIndex(matchedServerIndex);
          setEpisodeIndex(matchedEpisodeIndex);
        } else {
          const initServer = Number(searchParams.get("server") || 0);
          const initEpisode = Number(searchParams.get("episode") || 0);
          setServerIndex(Number.isNaN(initServer) ? 0 : initServer);
          setEpisodeIndex(Number.isNaN(initEpisode) ? 0 : initEpisode);
        }
        setComments(payload?.comments || []);
        setRatings(payload?.ratings || []);
        setUserRating(payload?.user_rating || null);
      } catch {
        setMovie(null);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [slug, searchParams]);

  const servers = movie?.episodes || [];
  const selectedServer = servers[serverIndex] || null;
  const selectedEpisode = selectedServer?.items?.[episodeIndex] || null;
  const genresText = useMemo(() => (movie?.genres || []).join(", "), [movie?.genres]);
  const streamUrl = streamOptions[selectedQuality] || streamOptions.auto || selectedEpisode?.m3u8 || "";
  const canUseEmbed = Boolean(selectedEpisode?.embed);
  const useEmbed = canUseEmbed && preferEmbed;

  useEffect(() => {
    setPreferEmbed(Boolean(selectedEpisode?.embed));
    lastSavedSecondRef.current = 0;
  }, [selectedEpisode?.slug]);

  useEffect(() => {
    async function loadStreamOptions() {
      if (!selectedEpisode?.m3u8 || useEmbed) {
        setStreamOptions({});
        return;
      }
      try {
        const payload = await getStreamOptions(selectedEpisode.m3u8);
        setStreamOptions(payload?.options || { auto: selectedEpisode.m3u8 });
        setSelectedQuality("auto");
      } catch {
        setStreamOptions({ auto: selectedEpisode.m3u8 });
        setSelectedQuality("auto");
      }
    }
    loadStreamOptions();
  }, [selectedEpisode?.m3u8, useEmbed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, selectedEpisode?.slug]);

  const handleEnded = () => {
    if (!autoNext) return;
    const items = selectedServer?.items || [];
    if (episodeIndex < items.length - 1) {
      setEpisodeIndex((prev) => prev + 1);
    }
  };

  const persistHistory = async () => {
    if (!movie || !selectedEpisode || !isLoggedIn()) return;
    await saveWatchHistory({
      slug: movie.slug,
      episode_slug: selectedEpisode.slug || "",
      episode_name: selectedEpisode.name || "",
      watched_seconds: 0,
      total_seconds: 0,
    });
  };

  useEffect(() => {
    persistHistory();
  }, [movie?.slug, selectedEpisode?.slug]);

  const onVideoTimeUpdate = async () => {
    if (!isLoggedIn() || !movie || !selectedEpisode || !videoRef.current) return;
    const current = Math.floor(videoRef.current.currentTime || 0);
    const duration = Math.floor(videoRef.current.duration || 0);
    if (current <= 0 || current - lastSavedSecondRef.current < 10) return;
    lastSavedSecondRef.current = current;
    await saveWatchHistory({
      slug: movie.slug,
      episode_slug: selectedEpisode.slug || "",
      episode_name: selectedEpisode.name || "",
      watched_seconds: current,
      total_seconds: duration,
    });
  };

  if (loading) return <p>Dang tai chi tiet phim...</p>;
  if (!movie) return <p>Khong tim thay phim.</p>;

  return (
    <section className="watch-page detail-limit">
      <div className="watch-header">
        <img src={movie.poster_url || movie.thumb_url} alt={movie.name} />
        <div>
          <h1>{movie.name}</h1>
          <p>{movie.original_name}</p>
          <p>{genresText}</p>
          <p>{movie.current_episode}</p>
          <p>{movie.language} - {movie.quality}</p>
          <p>{movie.average_rating || 0}/5 ({movie.review_count || 0} danh gia)</p>
        </div>
      </div>

      <div className="watch-controls">
        <div className="control-grid">
          <label htmlFor="server-select">Server</label>
          <select
            id="server-select"
            value={serverIndex}
            onChange={(e) => {
              setServerIndex(Number(e.target.value));
              setEpisodeIndex(0);
            }}
          >
            {servers.map((server, index) => (
              <option value={index} key={server.server_name || index}>
                {server.server_name || `Server ${index + 1}`}
              </option>
            ))}
          </select>

          {!useEmbed && (
            <>
              <label htmlFor="quality-select">Chat luong</label>
              <select id="quality-select" value={selectedQuality} onChange={(e) => setSelectedQuality(e.target.value)}>
                {(Object.keys(streamOptions).length ? Object.keys(streamOptions) : ["auto"]).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="speed-select">Toc do</label>
          <select id="speed-select" value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))}>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>

          <label className="inline-checkbox">
            <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
            Auto Next
          </label>
          {canUseEmbed && (
            <label className="inline-checkbox">
              <input type="checkbox" checked={preferEmbed} onChange={(e) => setPreferEmbed(e.target.checked)} />
              Dung Embed Player (de on dinh)
            </label>
          )}
        </div>

        <div className="episode-list">
          {(selectedServer?.items || []).map((episode, index) => (
            <button
              key={`${episode.slug}-${index}`}
              type="button"
              className={index === episodeIndex ? "active-episode" : ""}
              onClick={() => setEpisodeIndex(index)}
            >
              {episode.name}
            </button>
          ))}
        </div>
      </div>

      {useEmbed ? (
        <div className="player-box">
          <iframe title={`${movie.name}-${selectedEpisode?.name || "episode"}`} src={selectedEpisode.embed} allowFullScreen />
        </div>
      ) : streamUrl ? (
        <div className="player-box">
          <video
            key={`${selectedEpisode?.slug || "ep"}-${selectedQuality}`}
            ref={videoRef}
            controls
            autoPlay
            onEnded={handleEnded}
            onTimeUpdate={onVideoTimeUpdate}
          >
            <track kind="subtitles" srcLang="vi" label="Vietnamese" />
          </video>
        </div>
      ) : (
        <p>Tap nay chua co link xem.</p>
      )}

      <div className="panel">
        <h3>Danh sach tap ben canh</h3>
        <div className="episode-list">
          {(selectedServer?.items || []).map((episode, index) => (
            <button
              key={`${episode.slug}-${index}-side`}
              type="button"
              className={index === episodeIndex ? "active-episode" : ""}
              onClick={() => setEpisodeIndex(index)}
            >
              {episode.name}
            </button>
          ))}
        </div>
      </div>

      <MovieRatings slug={slug} ratings={ratings} onRefresh={fetchRatings} userRating={userRating} />
      <MovieComments slug={slug} comments={comments} onRefresh={fetchComments} />
    </section>
  );
}

export default MovieWatchPage;
