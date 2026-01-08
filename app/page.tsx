import Image from "next/image";
import LoadingScreen from "./loading";
import { Fragment } from "react/jsx-runtime";
import Graph from "@/components/Graph";

export default function Home() {
  return (
    <Fragment>
      <Graph />
      {/* <LoadingScreen /> */}
    </Fragment>
  )
}
