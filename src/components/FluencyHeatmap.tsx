import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Flame, TrendingDown, TrendingUp } from 'lucide-react';
import type { WritingSession } from '../types';
import {
  buildFluencyHeatmapData,
  type FluencyHeatmapCell,
} from '../utils/analytics';

interface FluencyHeatmapProps {
  sessions: WritingSession[];
  referenceDateISO: string;
  theme: 'light' | 'dark';
  onStartWriting?: () => void;
}

export function FluencyHeatmap({
  sessions,
  referenceDateISO,
  theme,
  onStartWriting,
}: FluencyHeatmapProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeCell, setActiveCell] = useState<FluencyHeatmapCell | null>(null);

  const dataset = useMemo(
    () => buildFluencyHeatmapData(sessions, referenceDateISO),
    [sessions, referenceDateISO]
  );

  // Default focused cell to the most recent populated cell (or top-right week)
  const defaultActiveCell = useMemo(() => {
    const populated = dataset.cells.filter((c) => c.value !== null);
    if (populated.length > 0) {
      return populated[populated.length - 1];
    }
    return null;
  }, [dataset]);

  const inspectedCell = activeCell ?? defaultActiveCell;

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const width = 880;
    const height = 296;
    const margin = { top: 44, right: 88, bottom: 38, left: 164 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();

    const isDark = theme === 'dark';
    const textPrimary = token('--ink-primary');
    const textMuted = token('--ink-muted');
    const emptyCellFill = token('--chart-empty');
    const emptyCellStroke = token('--chart-empty-border');
    const dividerStroke = token('--chart-grid');
    const statusSuccess = token('--status-success');
    const statusWarning = token('--status-warning');
    const accentColor = token('--accent');
    const cellInkLow = token('--chart-cell-ink-low');
    const cellInkHigh = token('--chart-cell-ink-high');

    const rampStops = [
      token('--chart-ramp-1'),
      token('--chart-ramp-2'),
      token('--chart-ramp-3'),
      token('--chart-ramp-4'),
    ];

    // Calibrated Tactile Minimal monochrome-to-sage sequential ramp over score range [4.5 .. 10]
    const colorScale = d3
      .scaleSequential<string>()
      .domain([4.5, 10])
      .clamp(true)
      .interpolator(d3.interpolateRgbBasis(rampStops));

    const xScale = d3
      .scaleBand<string>()
      .domain(dataset.weeks.map((w) => w.weekKey))
      .range([0, innerW])
      .padding(0.14);

    const yScale = d3
      .scaleBand<string>()
      .domain(dataset.metrics.map((m) => m.key))
      .range([0, innerH])
      .padding(0.18);

    const root = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Month header markers at top of X axis
    const monthHeaders = dataset.weeks.filter((w) => w.monthLabel);
    root
      .selectAll('g.month-marker')
      .data(monthHeaders)
      .enter()
      .append('g')
      .attr('class', 'month-marker')
      .each(function (d) {
        const g = d3.select(this);
        const xPos = xScale(d.weekKey) ?? 0;
        g.append('line')
          .attr('x1', xPos)
          .attr('x2', xPos)
          .attr('y1', -18)
          .attr('y2', innerH + 4)
          .attr('stroke', dividerStroke)
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2 3');

        g.append('text')
          .attr('x', xPos + 4)
          .attr('y', -22)
          .attr('fill', textPrimary)
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .text(d.monthLabel || '');
      });

    // Y-axis metric labels (6 international evaluation metrics)
    root
      .selectAll('text.metric-label')
      .data(dataset.metrics)
      .enter()
      .append('text')
      .attr('class', 'metric-label')
      .attr('x', -12)
      .attr('y', (d) => (yScale(d.key) ?? 0) + yScale.bandwidth() / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', textPrimary)
      .attr('font-size', '11.5px')
      .attr('font-weight', '500')
      .text((d) => d.label);

    // Column header for 3M delta
    root
      .append('text')
      .attr('x', innerW + 14)
      .attr('y', -22)
      .attr('fill', textMuted)
      .attr('font-size', '10.5px')
      .attr('font-weight', '600')
      .text('3M Trend');

    // Right-hand 3M delta summary per metric
    root
      .selectAll('text.metric-delta')
      .data(dataset.metricSummaries)
      .enter()
      .append('text')
      .attr('class', 'metric-delta')
      .attr('x', innerW + 14)
      .attr('y', (d) => (yScale(d.key) ?? 0) + yScale.bandwidth() / 2 + 4)
      .attr('font-size', '11px')
      .attr('font-family', 'var(--font-mono)')
      .attr('font-weight', '600')
      .attr('fill', (d) => {
        if (d.delta === null) return textMuted;
        if (d.delta > 0) return statusSuccess;
        if (d.delta < 0) return statusWarning;
        return textMuted;
      })
      .text((d) => {
        if (d.delta === null) {
          return d.latestValue !== null ? `${d.latestValue.toFixed(1)}` : '—';
        }
        const sign = d.delta > 0 ? '+' : '';
        return `${sign}${d.delta.toFixed(1)}`;
      });

    // Bottom X-axis using d3.axisBottom on evenly spaced week ticks
    const tickWeekKeys = dataset.weeks
      .filter((_, idx) => idx % 2 === 0 || idx === dataset.weeks.length - 1)
      .map((w) => w.weekKey);

    const xAxis = d3
      .axisBottom(xScale)
      .tickValues(tickWeekKeys)
      .tickFormat((wk) => {
        const found = dataset.weeks.find((w) => w.weekKey === wk);
        return found ? found.shortLabel : wk.slice(5);
      })
      .tickSize(0);

    const xAxisGroup = root
      .append('g')
      .attr('transform', `translate(0,${innerH + 10})`)
      .call(xAxis);

    xAxisGroup.select('.domain').remove();
    xAxisGroup
      .selectAll('text')
      .attr('fill', textMuted)
      .attr('font-size', '10px')
      .attr('font-family', 'var(--font-mono)');

    // Heatmap cells
    const cellGroups = root
      .selectAll<SVGGElement, FluencyHeatmapCell>('g.heatmap-cell')
      .data(dataset.cells)
      .enter()
      .append('g')
      .attr('class', 'heatmap-cell')
      .attr(
        'transform',
        (d) =>
          `translate(${xScale(d.weekKey) ?? 0},${yScale(d.metricKey) ?? 0})`
      );

    cellGroups
      .append('rect')
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('rx', 5)
      .attr('ry', 5)
      .attr('fill', (d) =>
        d.value !== null ? colorScale(d.value) : emptyCellFill
      )
      .attr('stroke', (d) => {
        const isSelected =
          inspectedCell &&
          inspectedCell.metricKey === d.metricKey &&
          inspectedCell.weekKey === d.weekKey;
        if (isSelected) return accentColor;
        return d.value !== null ? 'transparent' : emptyCellStroke;
      })
      .attr('stroke-width', (d) => {
        const isSelected =
          inspectedCell &&
          inspectedCell.metricKey === d.metricKey &&
          inspectedCell.weekKey === d.weekKey;
        return isSelected ? 1.75 : 1;
      })
      .style('cursor', 'pointer')
      .attr('tabindex', (d) => (d.value !== null ? 0 : -1))
      .attr('role', 'button')
      .attr(
        'aria-label',
        (d) =>
          `${d.metricLabel}, week of ${d.weekStart}: ${d.nativeDisplay}`
      )
      .on('mouseenter', (_event, d) => {
        setActiveCell(d);
      })
      .on('focus', (_event, d) => {
        setActiveCell(d);
      })
      .on('click', (_event, d) => {
        setActiveCell(d);
      });

    // Cell text readout inside populated cells
    cellGroups
      .filter((d) => d.value !== null && xScale.bandwidth() >= 28)
      .append('text')
      .attr('x', xScale.bandwidth() / 2)
      .attr('y', yScale.bandwidth() / 2 + 3.5)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('font-family', 'var(--font-mono)')
      .attr('fill', (d) => {
        if (d.value === null) return cellInkLow;
        if (isDark) {
          return d.value >= 8.2 ? cellInkHigh : cellInkLow;
        }
        return d.value < 6.8 ? cellInkLow : cellInkHigh;
      })
      .text((d) => (d.value !== null ? d.value.toFixed(1) : ''));
  }, [dataset, theme, inspectedCell]);

  const legendStops = useMemo(
    () => [
      { val: 5.0, cssVar: 'var(--chart-ramp-1)' },
      { val: 6.5, cssVar: 'var(--chart-ramp-2)' },
      { val: 8.0, cssVar: 'var(--chart-ramp-3)' },
      { val: 9.5, cssVar: 'var(--chart-ramp-4)' },
    ],
    []
  );

  const globalMean = useMemo(() => {
    const vals = dataset.cells
      .map((c) => c.value)
      .filter((v): v is number => v !== null);
    const computed = d3.mean(vals);
    return computed !== undefined ? Number(computed.toFixed(1)) : null;
  }, [dataset]);

  return (
    <section
      aria-label="Fluency Heatmap over the past 3 months"
      data-testid="fluency-heatmap"
      className="card-surface p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
            <Flame className="w-3.5 h-3.5 text-status-warning" aria-hidden="true" />
            <span>3-Month D3 Fluency Matrix</span>
          </div>
          <h2 className="text-base font-semibold text-ink-primary mt-0.5">
            Fluency Heatmap
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Weekly progression of the 6 international evaluation metrics from{' '}
            <span className="font-mono-tabular">{dataset.windowStartISO}</span> to{' '}
            <span className="font-mono-tabular">{dataset.windowEndISO}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono-tabular text-ink-muted">
          <span>
            {dataset.totalSessionsInWindow} sessions · {dataset.activeWeeksCount}/
            {dataset.weeks.length} active wks
            {globalMean !== null ? ` · Avg ${globalMean}/10` : ''}
          </span>
          <div
            className="flex items-center gap-1.5"
            aria-label="Heatmap intensity legend"
          >
            <span className="inline-flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-xs border"
                style={{
                  backgroundColor: 'var(--chart-empty)',
                  borderColor: 'var(--chart-empty-border)',
                }}
              />
              None
            </span>
            {legendStops.map((stop) => (
              <span key={stop.val} className="inline-flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: stop.cssVar }}
                />
                {stop.val}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* D3 SVG Matrix */}
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <svg
            ref={svgRef}
            className="w-full h-auto block select-none"
            role="img"
            aria-label="D3 heatmap of 6 international English evaluation metrics across the past 3 months"
          />
        </div>
      </div>

      {/* Interactive Cell Detail Strip or Empty CTA */}
      {dataset.totalSessionsInWindow === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border-subtle bg-subtle">
          <p className="text-xs text-ink-secondary">
            No evaluated drafts in the past 3 months yet. Complete a writing session to populate your weekly international metric progression.
          </p>
          {onStartWriting && (
            <button
              type="button"
              onClick={onStartWriting}
              className="btn-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0"
            >
              Start First Session
            </button>
          )}
        </div>
      ) : inspectedCell ? (
        <div
          data-testid="fluency-heatmap-inspector"
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg border border-border-subtle bg-subtle text-xs"
        >
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-ink-primary font-medium">
              <span>{inspectedCell.metricLabel}</span>
              <span className="text-ink-muted" aria-hidden="true">
                ·
              </span>
              <span className="text-ink-secondary font-normal">
                {inspectedCell.standard}
              </span>
              <span className="text-ink-muted" aria-hidden="true">
                ·
              </span>
              <span className="font-mono-tabular text-ink-secondary">
                Week {inspectedCell.weekStart} to {inspectedCell.weekEnd}
              </span>
            </div>
            {inspectedCell.topics.length > 0 && (
              <div className="text-ink-muted truncate max-w-2xl">
                Sessions ({inspectedCell.sessionCount}):{' '}
                {inspectedCell.topics.join(' · ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 font-mono-tabular shrink-0">
            <span className="text-sm font-semibold text-ink-primary">
              {inspectedCell.nativeDisplay}
            </span>
            {inspectedCell.deltaFromPrev !== null && (
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  inspectedCell.deltaFromPrev > 0
                    ? 'text-status-success'
                    : inspectedCell.deltaFromPrev < 0
                      ? 'text-status-warning'
                      : 'text-ink-muted'
                }`}
              >
                {inspectedCell.deltaFromPrev > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                ) : inspectedCell.deltaFromPrev < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
                ) : null}
                <span>
                  {inspectedCell.deltaFromPrev > 0 ? '+' : ''}
                  {inspectedCell.deltaFromPrev.toFixed(1)} vs prior active wk
                </span>
              </span>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
