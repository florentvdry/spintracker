import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, ArrowRight } from 'lucide-react';

export default function NextActions({ stats }) {
  const { t } = useTranslation();

  const getSuggestions = () => {
    const suggestions = [];
    if (!stats) return suggestions;

    const { Vpip, Pfr, ThreeBet, Wtsd, AggressionFreq } = stats;

    if (Vpip < 20) {
      suggestions.push({
        title: 'Increase Preflop Aggression',
        desc: `Your VPIP (${Vpip.toFixed(1)}%) is quite low. Try opening more hands from late positions (CO, BTN).`,
        priority: 'high'
      });
    } else if (Vpip > 35) {
      suggestions.push({
        title: 'Tighten Up Preflop',
        desc: `Your VPIP (${Vpip.toFixed(1)}%) is high. You might be playing too many junk hands.`,
        priority: 'medium'
      });
    }

    if (Pfr < 15) {
      suggestions.push({
        title: 'Raise More Often',
        desc: `Your PFR (${Pfr.toFixed(1)}%) suggests passive play. Avoid limping and raise your strong hands.`,
        priority: 'high'
      });
    }

    const gap = Vpip - Pfr;
    if (gap > 10) {
      suggestions.push({
        title: 'Close the VPIP/PFR Gap',
        desc: `The gap (${gap.toFixed(1)}%) is too wide. You are calling too much. Raise or Fold.`,
        priority: 'high'
      });
    }

    if (ThreeBet < 5) {
      suggestions.push({
        title: '3-Bet More',
        desc: `3-Bet frequency (${ThreeBet.toFixed(1)}%) is low. Re-raise with your premiums and some bluffs.`,
        priority: 'medium'
      });
    }

    if (Wtsd > 32) {
      suggestions.push({
        title: 'Fold More Rivers',
        desc: `WTSD (${Wtsd.toFixed(1)}%) is high. You might be calling down too light.`,
        priority: 'medium'
      });
    }

    if (AggressionFreq < 30) { // arbitrary threshold for frequency
        suggestions.push({
            title: 'Be More Aggressive Postflop',
            desc: `Aggression Freq (${AggressionFreq.toFixed(1)}%) is low. Bet your draws and strong hands.`,
            priority: 'medium'
        });
    }

    return suggestions;
  };

  const suggestions = getSuggestions();

  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
          <Lightbulb className="w-4 h-4 text-yellow-500" />
        </div>
        <h3 className="font-semibold">{t('analysis.next_actions', 'Next Actions')}</h3>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
        {suggestions.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {t('analysis.no_suggestions', 'Good job! No critical leaks detected based on current filters.')}
          </div>
        ) : (
          suggestions.map((item, i) => (
            <div key={i} className="bg-dark-400/50 rounded-lg p-3 border border-dark-200/50 hover:border-primary-500/30 transition-colors group">
              <div className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                  item.priority === 'high' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
                <div>
                  <h4 className="text-sm font-medium text-gray-200 group-hover:text-primary-400 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-primary-400 ml-auto opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
