import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import NewsDashboard from "@/components/NewsDashboard";

function App() {
  return (
    <div className="App">
      <Toaster position="top-right" theme="dark" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<NewsDashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
