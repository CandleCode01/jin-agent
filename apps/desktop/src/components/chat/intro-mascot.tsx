import jinLogo from '../../assets/jin-logo.png'

type IntroMascotProps = {
  className?: string
}

export function IntroMascot({ className = '' }: IntroMascotProps) {
  return (
    <>
      <style>{`
        @keyframes jinHeartbeat {
          0%, 100% { transform: scale(1); }
          8% { transform: scale(1.025); }
          15% { transform: scale(1); }
          23% { transform: scale(1.055); }
          34% { transform: scale(1); }
        }

        @keyframes jinBlink {
          0%, 88%, 92%, 100% { transform: scaleY(0); }
          89.5%, 90.5% { transform: scaleY(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .jin-mascot-heartbeat,
          .jin-mascot-eyelid {
            animation: none !important;
          }
        }
      `}</style>

      <div className={`mb-4 flex w-full justify-center ${className}`} aria-hidden="true">
        <div className="relative h-[230px] w-[230px]">
          <div
            className="jin-mascot-heartbeat relative h-full w-full"
            style={{
              animation: 'jinHeartbeat 1.65s ease-in-out infinite',
              transformOrigin: 'center center'
            }}
          >
            <img
              src={jinLogo}
              alt=""
              draggable={false}
              className="block h-full w-full select-none object-contain"
            />

            <span
              className="jin-mascot-eyelid pointer-events-none absolute rounded-full"
              style={{
                left: '60.6%',
                top: '36.8%',
                width: '5.9%',
                height: '12.4%',
                background: '#050505',
                transform: 'scaleY(0)',
                transformOrigin: 'center center',
                animation: 'jinBlink 5.2s ease-in-out infinite'
              }}
            />

            <span
              className="jin-mascot-eyelid pointer-events-none absolute rounded-full"
              style={{
                left: '71.1%',
                top: '35.4%',
                width: '5.2%',
                height: '11.8%',
                background: '#050505',
                transform: 'scaleY(0)',
                transformOrigin: 'center center',
                animation: 'jinBlink 5.2s ease-in-out infinite'
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
