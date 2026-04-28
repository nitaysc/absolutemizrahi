import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { ProfileProvider } from "@/hooks/useUserProfile";
import { PresenceProvider } from "@/hooks/usePresence";
import { ProgressionProvider } from "@/hooks/useProgression";
import { ProgressionOverlay } from "@/components/ProgressionOverlay";
import AuthPage from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Lobby from "./pages/Lobby";
import Dice from "./pages/Dice";
import Coinflip from "./pages/Coinflip";
import Mines from "./pages/Mines";
import Limbo from "./pages/Limbo";
import Crash from "./pages/Crash";
import Blackjack from "./pages/Blackjack";
import Chicken from "./pages/Chicken";
import Plinko from "./pages/Plinko";
import Pump from "./pages/Pump";
import DragonTower from "./pages/DragonTower";
import Poker from "./pages/Poker";
import PokerLobby from "./pages/PokerLobby";
import Snakes from "./pages/Snakes";
import Wordle from "./pages/Wordle";
import Moles from "./pages/Moles";
import Roulette from "./pages/Roulette";
import Keno from "./pages/Keno";
import Slide from "./pages/Slide";
import Slides from "./pages/Slides";
import ChessLobby from "./pages/ChessLobby";
import ChessGame from "./pages/Chess";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import PlayerProfile from "./pages/PlayerProfile";
import Prediction from "./pages/Prediction";
import Cases from "./pages/Cases";
import CaseBattles from "./pages/CaseBattles";
import CaseBattleCreate from "./pages/CaseBattleCreate";
import CaseBattleRoom from "./pages/CaseBattleRoom";
import CaseUpload from "./pages/CaseUpload";
import CaseAdmin from "./pages/CaseAdmin";
import Inventory from "./pages/Inventory";
import Upgrader from "./pages/Upgrader";
import Progression from "./pages/Progression";
import NotFound from "./pages/NotFound";
import HiLo from "./pages/HiLo";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <AuthProvider>
    <ProfileProvider>
      <ProgressionProvider>
      <PresenceProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route path="/" element={<Lobby />} />
            <Route path="/dice" element={<Dice />} />
            <Route path="/limbo" element={<Limbo />} />
            <Route path="/mines" element={<Mines />} />
            <Route path="/coinflip" element={<Coinflip />} />
            <Route path="/crash" element={<Crash />} />
            <Route path="/blackjack" element={<Blackjack />} />
            <Route path="/chicken" element={<Chicken />} />
            <Route path="/plinko" element={<Plinko />} />
            <Route path="/pump" element={<Pump />} />
            <Route path="/dragontower" element={<DragonTower />} />
            <Route path="/poker" element={<PokerLobby />} />
            <Route path="/poker/:tableId" element={<Poker />} />
            <Route path="/snakes" element={<Snakes />} />
            <Route path="/wordle" element={<Wordle />} />
            <Route path="/moles" element={<Moles />} />
            <Route path="/roulette" element={<Roulette />} />
            <Route path="/keno" element={<Keno />} />
            <Route path="/slide" element={<Slide />} />
            <Route path="/slides" element={<Slides />} />
            <Route path="/hilo" element={<HiLo />} />
            <Route path="/chess" element={<ChessLobby />} />
            <Route path="/chess/:gameId" element={<ChessGame />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/progression" element={<Progression />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/u/:username" element={<PlayerProfile />} />
            <Route path="/prediction" element={<Prediction />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/upload" element={<CaseUpload />} />
            <Route path="/cases/admin" element={<CaseAdmin />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/upgrader" element={<Upgrader />} />
            <Route path="/cases/battles" element={<CaseBattles />} />
            <Route path="/cases/battles/new" element={<CaseBattleCreate />} />
            <Route path="/cases/battles/:id" element={<CaseBattleRoom />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <ProgressionOverlay />
        <Toaster />
      </BrowserRouter>
      </PresenceProvider>
      </ProgressionProvider>
    </ProfileProvider>
  </AuthProvider>
);

export default App;
