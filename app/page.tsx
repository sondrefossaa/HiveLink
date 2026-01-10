import Image from "next/image";
import LoadingScreen from "./loading";
import { Fragment } from "react/jsx-runtime";
import Graph from "@/components/Graph";
import ParticleBackground from "@/components/ParticleBackground";

export default function Home() {
  return (
    <Fragment>
      <ParticleBackground />
      <Graph />
      {/* <LoadingScreen /> */}
    </Fragment>
  )
}
