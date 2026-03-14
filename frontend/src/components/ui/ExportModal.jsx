import { useReplayerStore } from '@stores/replayerStore';
import { Video, X, FileText, List } from 'lucide-react';

export default function ExportModal() {
  const { showExportModal, closeExportModal, confirmExport, recordingType, isRecording } = useReplayerStore();

  if (!showExportModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-dark-400 border border-primary-500/30 rounded-xl p-6 w-[420px] shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Video className="w-5 h-5 text-primary-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Exporter la vidéo</h3>
          </div>
          <button
            onClick={closeExportModal}
            className="p-1 hover:bg-dark-200 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <p className="text-gray-400 mb-6 text-sm">
          Que souhaitez-vous enregistrer ?
        </p>

        <div className="space-y-3">
          <button
            onClick={() => confirmExport('hand')}
            disabled={isRecording}
            className="w-full p-4 bg-dark-300 hover:bg-dark-200 border border-dark-100 rounded-lg transition-all group flex items-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-2 bg-primary-500/20 rounded-lg group-hover:bg-primary-500/30 transition-colors">
              <FileText className="w-5 h-5 text-primary-400" />
            </div>
            <div className="text-left">
              <div className="text-white font-medium">Main actuelle</div>
              <div className="text-gray-500 text-sm">Enregistrer uniquement la main en cours</div>
            </div>
          </button>

          <button
            onClick={() => confirmExport('tournament')}
            disabled={isRecording}
            className="w-full p-4 bg-dark-300 hover:bg-dark-200 border border-dark-100 rounded-lg transition-all group flex items-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="p-2 bg-secondary-500/20 rounded-lg group-hover:bg-secondary-500/30 transition-colors">
              <List className="w-5 h-5 text-secondary-400" />
            </div>
            <div className="text-left">
              <div className="text-white font-medium">Tout le tournoi</div>
              <div className="text-gray-500 text-sm">Enregistrer toutes les mains du joueur</div>
            </div>
          </button>
        </div>

        {isRecording && (
          <div className="mt-4 p-3 bg-primary-500/10 border border-primary-500/30 rounded-lg">
            <p className="text-primary-400 text-sm text-center">
              {recordingType === 'hand' ? 'Enregistrement de la main en cours...' : 'Enregistrement du tournoi en cours...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
