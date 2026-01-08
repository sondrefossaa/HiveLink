'use client'
import logo from '@/public/logo.svg';
import Image from 'next/image';
import { useState, useEffect } from 'react';

export default function LoadingScreen() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(to bottom, black, var(--hive-charcoal))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
      }}
    >
      {/* Logo with inline pulsing zoom animation */}
      <div
        style={{
          position: 'relative',
          animation: 'pulseZoom 2s ease-in-out infinite',
        }}
      >
        <Image
          src={logo}
          alt="HiveLink Logo"
          width={300}
          height={300}
          style={{
            filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))',
          }}
          priority
        />


      </div>

      {/* Keyframes for logo "breathing" */}
      <style jsx global>{`
        @keyframes pulseZoom {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.9;
          }
          50% { 
            transform: scale(1.2); 
            opacity: 1;
          }
        }
        
        @keyframes pulseRing {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.3;
          }
          50% { 
            transform: scale(1.1); 
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}
