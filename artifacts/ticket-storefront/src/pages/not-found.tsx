import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-muted-foreground mb-4">404</h1>
        <p className="text-lg text-muted-foreground mb-6">Página no encontrada</p>
        <button
          onClick={() => setLocation("/")}
          className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
          Ir a eventos
        </button>
      </div>
    </div>
  );
}
