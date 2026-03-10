import { FarmCanvas } from './components/FarmCanvas';
import { useGameState } from './hooks/useGameState';
import './App.css';

function App() {
  const { gameState, harvest } = useGameState();

  return (
    <div className="app-container">
      <div className="drag-region" data-tauri-drag-region />
      <FarmCanvas gameState={gameState} onHarvest={harvest} />
    </div>
  );
}

export default App;
