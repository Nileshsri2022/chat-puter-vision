import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";

const App = () => (
  <ErrorBoundary>
    <Toaster />
    <Index />
  </ErrorBoundary>
);

export default App;
