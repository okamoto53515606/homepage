"use client";

import { useEffect, useState } from "react";
import { Step0AwsKey } from "@/components/step0-aws-key";

export default function Setup0Page() {
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        const phase = data.phases?.find(
          (p: { id: string }) => p.id === "setup0"
        );
        if (phase?.status === "completed") setCompleted(true);
      })
      .catch(() => {});
  }, []);

  return <Step0AwsKey completed={completed} />;
}
