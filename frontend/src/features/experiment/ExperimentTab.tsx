/**
 * ExperimentTab — placeholder for future GP-based experiment design.
 * Clean white card with professional layout.
 */
import { Sparkles, FlaskConical, Target, TrendingUp } from "lucide-react";

export function ExperimentTab() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Coming soon
        </span>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
          Experiment Designer
        </h1>
        <p className="mt-2 text-sm text-gray-500 max-w-2xl leading-relaxed">
          Gaussian-process active learning for next-experiment recommendation
          over tested perturbations.
        </p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center mb-3">
            <Target className="w-5 h-5 text-blue-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Exploration</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Identify untested perturbations that maximize information gain
            from the GP posterior.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Exploitation</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Predict the untested perturbation with the largest
            expected phenotypic effect.
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center mb-3">
            <FlaskConical className="w-5 h-5 text-purple-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Cold start</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Uses the pathway prior from the Ranking tab as a
            deterministic ordering when no experiments exist yet.
          </p>
        </div>
      </div>

      {/* Roadmap note */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Research roadmap
          </h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            This module is part of the PhD research directions. Given existing
            results from the Overview tab, the GP posterior will identify the
            untested perturbation that either maximizes information gain
            (exploration) or predicted phenotypic effect (exploitation).
          </p>
        </div>
      </div>
    </div>
  );
}
