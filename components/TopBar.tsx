'use client'

import "./TopBar.css"
import Image from 'next/image';
import logo from '../public/logo.svg';

export default function TopBar() {
  return (
    <div className="mainContainer"
    >
      {/* add logo */}
      <Image
        src={logo}
        alt="Logo"
        width={100}  // Adjust as needed
        height={50} // Adjust as needed
        className="your-classes"
      />
      <h1
        className=""
        style={{
          color: "#F4B300",
          textAlign: "center",
          fontSize: "100px",
        }}
      >HiveLink</h1>
    </div>

  )
}
