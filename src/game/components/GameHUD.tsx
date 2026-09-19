import { useGameStore } from "../stores/gameStore";
import { Coins, TrendingUp, User, Volume2, VolumeX } from "lucide-react";
import { AudioService } from "../services/audioService";
import { useState } from "react";

export const GameHUD = () => {
  const { player } = useGameStore();
  const expPercentage = (player.exp / player.expToNextLevel) * 100;
  const [soundEnabled, setSoundEnabled] = useState(AudioService.isEnabled());

  const toggleSound = () => {
    const newState = AudioService.toggle();
    setSoundEnabled(newState);
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/40 to-transparent p-3">
      <div className="flex items-center justify-between max-w-4xl mx-auto gap-3">
        {/* Level */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
          <User className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">Cấp {player.level}</span>
        </div>

        {/* XP Bar */}
        <div className="flex-1 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <div className="flex-1">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${expPercentage}%` }}
                />
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {player.exp} / {player.expToNextLevel} XP
              </div>
            </div>
          </div>
        </div>

        {/* Coins */}
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-lg">
          <Coins className="w-4 h-4 text-yellow-600" />
          <span className="text-sm font-semibold text-gray-800">
            {player.coins.toLocaleString()}
          </span>
        </div>

        {/* Sound toggle */}
        <button
          onClick={toggleSound}
          className="bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg hover:scale-110 active:scale-95 transition-all touch-manipulation"
          title={soundEnabled ? "Tắt âm thanh" : "Bật âm thanh"}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-gray-700" />
          ) : (
            <VolumeX className="w-4 h-4 text-gray-400" />
          )}
        </button>
      </div>
    </div>
  );
};
