import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { ProfileProvider } from "@/hooks/useUserProfile";
import { PresenceProvider } from "@/hooks/usePresence";
import AuthPage from "./pages/Auth";
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
import ChessLobby from "./pages/ChessLobby";
import ChessGame from "./pages/Chess";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Friends from "./pages/Friends";
import PlayerProfile from "./pages/PlayerProfile";
import Prediction from "./pages/Prediction";
import NotFound from "./pages/NotFound";

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
      <PresenceProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
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
            <Route path="/chess" element={<ChessLobby />} />
            <Route path="/chess/:gameId" element={<ChessGame />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/u/:username" element={<PlayerProfile />} />
            <Route path="/prediction" element={<Prediction />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
      </PresenceProvider>
    </ProfileProvider>
  </AuthProvider>
);

export default App;
