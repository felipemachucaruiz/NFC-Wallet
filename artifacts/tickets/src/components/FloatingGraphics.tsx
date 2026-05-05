import { useMemo } from "react";

const KEYFRAMES = `
@keyframes fl-a {
  0%   { transform: translate(0px,   0px)   rotate(0deg);   }
  20%  { transform: translate(28px,  -48px) rotate(16deg);  }
  45%  { transform: translate(-22px, -82px) rotate(-11deg); }
  65%  { transform: translate(42px,  -58px) rotate(24deg);  }
  85%  { transform: translate(-8px,  -100px) rotate(-7deg); }
  100% { transform: translate(0px,   0px)   rotate(0deg);   }
}
@keyframes fl-b {
  0%   { transform: translate(0px,   0px)   rotate(0deg);   }
  25%  { transform: translate(-38px, -32px) rotate(-19deg); }
  50%  { transform: translate(18px,  -74px) rotate(12deg);  }
  75%  { transform: translate(-28px, -48px) rotate(-16deg); }
  100% { transform: translate(0px,   0px)   rotate(0deg);   }
}
@keyframes fl-c {
  0%   { transform: translate(0px,  0px)   rotate(0deg);   }
  33%  { transform: translate(44px, -42px) rotate(28deg);  }
  66%  { transform: translate(-14px,-78px) rotate(-19deg); }
  100% { transform: translate(0px,  0px)   rotate(0deg);   }
}
@keyframes fl-d {
  0%   { transform: translate(0px,   0px)    rotate(0deg);   }
  30%  { transform: translate(-32px, -56px)  rotate(-24deg); }
  60%  { transform: translate(36px,  -92px)  rotate(14deg);  }
  100% { transform: translate(0px,   0px)    rotate(0deg);   }
}
@keyframes fl-e {
  0%   { transform: translate(0px,  0px)   rotate(0deg);  }
  20%  { transform: translate(56px, -28px) rotate(9deg);  }
  50%  { transform: translate(26px, -70px) rotate(-21deg);}
  80%  { transform: translate(-18px,-42px) rotate(17deg); }
  100% { transform: translate(0px,  0px)   rotate(0deg);  }
}
`;

const ANIMS = ["fl-a", "fl-b", "fl-c", "fl-d", "fl-e"] as const;
const COUNT = 14;

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

interface Props {
  url: string;
}

export function FloatingGraphics({ url }: Props) {
  const items = useMemo(() =>
    Array.from({ length: COUNT }, (_, i) => {
      const r = (o: number) => seededRand(i * 7 + o);
      return {
        left:     r(0) * 92,
        top:      r(1) * 92,
        size:     34 + r(2) * 50,        // 34px – 84px
        opacity:  0.28 + r(3) * 0.22,    // 0.28 – 0.50
        duration: 24 + r(4) * 20,        // 24s – 44s
        delay:    -(r(5) * 22),          // start mid-cycle so they don't all move together
        anim:     ANIMS[Math.floor(r(6) * ANIMS.length)],
      };
    }),
  []);

  return (
    <>
      <style>{KEYFRAMES}</style>
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none select-none"
        style={{ zIndex: 1 }}
        aria-hidden="true"
      >
        {items.map((item, i) => (
          <img
            key={i}
            src={url}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: `${item.left}%`,
              top: `${item.top}%`,
              width: `${item.size}px`,
              height: `${item.size}px`,
              objectFit: "contain",
              opacity: item.opacity,
              animation: `${item.anim} ${item.duration}s ${item.delay}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>
    </>
  );
}
