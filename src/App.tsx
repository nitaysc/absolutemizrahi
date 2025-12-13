import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ThemePreviewProvider } from "@/contexts/ThemePreviewContext";
import { AccentColorProvider } from "@/components/AccentColorProvider";
import { SwipeablePages } from "@/components/SwipeablePages";
import { BottomNav } from "@/components/bottom-nav";
import Today from "./pages/Today";
import Calendar from "./pages/Calendar";
import Stats from "./pages/Stats";
import Profile from "./pages/Profile";
import Shop from "./pages/Shop";
import TimerPage from "./pages/TimerPage";
import NotesPage from "./pages/NotesPage";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const mainRoutes = ["/", "/calendar", "/stats", "/profile", "/timer", "/notes"];

function AppRoutes() {
  const location = useLocation();
  const { user } = useAuth();
  const showBottomNav = user && mainRoutes.includes(location.pathname);
  
  return (
    <>
      <SwipeablePages>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Today />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SwipeablePages>
      {showBottomNav && <BottomNav />}
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <ThemePreviewProvider>
          <AccentColorProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </TooltipProvider>
          </AccentColorProvider>
        </ThemePreviewProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
