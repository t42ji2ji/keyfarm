import { FarmCanvas } from './components/FarmCanvas';
import { useGameState } from './hooks/useGameState';
import './App.css';

function App() {
  const { gameState, harvest, animations } = useGameState();

  return (
    <div className="app-container">
      <div className="drag-region" data-tauri-drag-region />
      <FarmCanvas gameState={gameState} animations={animations} onHarvest={harvest} />
    </div>
  );
}

export default App;
