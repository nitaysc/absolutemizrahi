import mizrahi from "@/assets/absolute-mizrahi.gif";

const Home = () => {
  return (
    <main className="min-h-screen w-full bg-black overflow-hidden">
      <h1 className="sr-only">Absolute Mizrahi</h1>

      {/* Tiled background */}
      <div
        aria-hidden
        className="fixed inset-0 opacity-30"
        style={{
          backgroundImage: `url(${mizrahi})`,
          backgroundRepeat: "repeat",
          backgroundSize: "200px",
        }}
      />

      {/* Hero */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8 p-6">
        <img
          src={mizrahi}
          alt="Absolute Mizrahi"
          className="w-full max-w-2xl rounded-3xl shadow-2xl ring-4 ring-white/20"
        />
        <h2 className="text-center text-5xl font-extrabold tracking-tight text-white drop-shadow-lg md:text-7xl">
          ABSOLUTE MIZRAHI
        </h2>
      </section>
    </main>
  );
};

export default Home;
