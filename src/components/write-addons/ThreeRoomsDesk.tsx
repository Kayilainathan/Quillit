import React, { useRef } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { computeWordWindowStatus } from '../../utils/writeStudioAddons';
import { useSlidingInkIndicator } from './useSlidingInkIndicator';

interface ThreeRoomsDeskProps {
  roomAText: string;
  roomBText: string;
  roomAWordCount: number;
  roomBWordCount: number;
  jargonHits: string[];
  mobileRoomTab: 'roomA' | 'roomB';
  onChangeMobileRoomTab: (tab: 'roomA' | 'roomB') => void;
  onChangeRoomA: (val: string) => void;
  onChangeRoomB: (val: string) => void;
}

export const ThreeRoomsDesk: React.FC<ThreeRoomsDeskProps> = ({
  roomAText,
  roomBText,
  roomAWordCount,
  roomBWordCount,
  jargonHits,
  mobileRoomTab,
  onChangeMobileRoomTab,
  onChangeRoomA,
  onChangeRoomB,
}) => {
  const mobileTabRef = useRef<HTMLDivElement>(null);
  const mobileInk = useSlidingInkIndicator(mobileTabRef, mobileRoomTab);

  const roomAStatus = computeWordWindowStatus(roomAWordCount, 50, 90);
  const roomBStatus = computeWordWindowStatus(roomBWordCount, 70, 120);

  return (
    <div data-testid="three-rooms-editor" className="drawer-reveal space-y-3">
      {/* Mobile Minimal Ink-Underline Room Switcher */}
      <div
        ref={mobileTabRef}
        className="relative flex md:hidden items-center gap-4 border-b border-border-subtle"
      >
        <button
          type="button"
          data-active={mobileRoomTab === 'roomA' ? 'true' : 'false'}
          onClick={() => onChangeMobileRoomTab('roomA')}
          className={`relative pb-2 text-xs transition-colors cursor-pointer ${
            mobileRoomTab === 'roomA'
              ? 'text-ink-primary font-semibold'
              : 'text-ink-muted'
          }`}
        >
          <span>Room A · 10-Yr-Old</span>
          <span className="ml-1.5 font-mono-tabular text-[10px] opacity-70">
            {roomAWordCount}w
          </span>
        </button>

        <button
          type="button"
          data-active={mobileRoomTab === 'roomB' ? 'true' : 'false'}
          onClick={() => onChangeMobileRoomTab('roomB')}
          className={`relative pb-2 text-xs transition-colors cursor-pointer ${
            mobileRoomTab === 'roomB'
              ? 'text-ink-primary font-semibold'
              : 'text-ink-muted'
          }`}
        >
          <span>Room B · Interviewer</span>
          <span className="ml-1.5 font-mono-tabular text-[10px] opacity-70">
            {roomBWordCount}w
          </span>
        </button>

        <span
          aria-hidden="true"
          className="ink-glide-underline pointer-events-none absolute left-0 bottom-0 h-[2px] w-[100px] origin-left rounded-full bg-ink-primary"
          style={{
            opacity: mobileInk.ready ? 1 : 0,
            transform: `translate3d(${mobileInk.left}px, 0, 0) scaleX(${
              mobileInk.width / 100
            })`,
          }}
        />
      </div>

      {/* Open-Book Editorial Diptych Spread */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border-subtle rounded-lg border border-border-subtle bg-subtle/20 overflow-hidden">
        {/* Left Folio: Room A — Plain Analogy */}
        <div
          className={`p-4 sm:p-5 space-y-2.5 ${
            mobileRoomTab === 'roomB' ? 'hidden md:block' : 'block'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="font-display text-sm font-semibold text-ink-primary">
                Room A · Curious 10-Year-Old
              </div>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Plain everyday analogy — zero acronyms or jargon.
              </p>
            </div>
            <span
              className={`font-mono-tabular text-[11px] shrink-0 ${
                roomAStatus.state === 'in-zone'
                  ? 'text-status-success font-semibold'
                  : roomAStatus.state === 'over'
                    ? 'text-status-warning font-semibold'
                    : 'text-ink-muted'
              }`}
            >
              {roomAWordCount}/50–90w
            </span>
          </div>

          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-border-subtle/80 rounded-full overflow-hidden"
          >
            <div
              className={`h-full w-full origin-left transition-transform duration-200 ${
                roomAStatus.state === 'in-zone'
                  ? 'bg-status-success'
                  : roomAStatus.state === 'over'
                    ? 'bg-status-warning'
                    : 'bg-ink-primary/70'
              }`}
              style={{ transform: `scaleX(${roomAStatus.ratio})` }}
            />
          </div>

          <textarea
            id="room-a-editor"
            data-testid="room-a-editor"
            rows={7}
            value={roomAText}
            onChange={(e) => onChangeRoomA(e.target.value)}
            placeholder="Explain it with a kitchen or playground analogy. Zero jargon..."
            className="w-full bg-transparent text-[16px] sm:text-[15px] leading-[1.82] text-ink-primary placeholder:text-ink-muted focus:outline-none resize-y"
          />

          <div
            data-testid="room-a-jargon-status"
            className="pt-2 border-t border-border-subtle/75 flex items-center gap-1.5 text-[11px] font-mono-tabular"
          >
            {jargonHits.length === 0 ? (
              <>
                <CheckCircle2
                  className="w-3.5 h-3.5 text-status-success shrink-0"
                  aria-hidden="true"
                />
                <span className="text-status-success">Jargon check clean</span>
              </>
            ) : (
              <>
                <AlertCircle
                  className="w-3.5 h-3.5 text-status-warning shrink-0"
                  aria-hidden="true"
                />
                <span className="text-status-warning">
                  Jargon in Room A: {jargonHits.join(', ')}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Folio: Room B — Senior Interviewer Defense */}
        <div
          className={`p-4 sm:p-5 space-y-2.5 ${
            mobileRoomTab === 'roomA' ? 'hidden md:block' : 'block'
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="font-display text-sm font-semibold text-ink-primary">
                Room B · Skeptical Interviewer
              </div>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Crisp executive defense — name failure modes &amp; trade-offs.
              </p>
            </div>
            <span
              className={`font-mono-tabular text-[11px] shrink-0 ${
                roomBStatus.state === 'in-zone'
                  ? 'text-status-success font-semibold'
                  : roomBStatus.state === 'over'
                    ? 'text-status-warning font-semibold'
                    : 'text-ink-muted'
              }`}
            >
              {roomBWordCount}/70–120w
            </span>
          </div>

          <div
            aria-hidden="true"
            className="h-[2px] w-full bg-border-subtle/80 rounded-full overflow-hidden"
          >
            <div
              className={`h-full w-full origin-left transition-transform duration-200 ${
                roomBStatus.state === 'in-zone'
                  ? 'bg-status-success'
                  : roomBStatus.state === 'over'
                    ? 'bg-status-warning'
                    : 'bg-ink-primary/70'
              }`}
              style={{ transform: `scaleX(${roomBStatus.ratio})` }}
            />
          </div>

          <textarea
            id="room-b-editor"
            data-testid="room-b-editor"
            rows={7}
            value={roomBText}
            onChange={(e) => onChangeRoomB(e.target.value)}
            placeholder="State the failure mode, trade-off, and concrete fix sharply..."
            className="w-full bg-transparent text-[16px] sm:text-[15px] leading-[1.82] text-ink-primary placeholder:text-ink-muted focus:outline-none resize-y"
          />

          <div className="pt-2 border-t border-border-subtle/75 text-[11px] font-mono-tabular text-ink-muted">
            Target: sharp engineering register · 70–120 words
          </div>
        </div>
      </div>
    </div>
  );
};
