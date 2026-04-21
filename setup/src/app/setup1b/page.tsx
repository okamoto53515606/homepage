"use client";
"use client";

import { useEffect, useState } from "react";
import { Step1bCdk } from "@/components/step1b-cdk";

export default function Setup1bPage() {
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        const phase = data.phases?.find(
          (p: { id: string }) => p.id === "setup1b",
        );
        if (phase?.status === "completed") {
          setCompleted(true);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <Step1bCdk completed={completed} />
    </div>
  );
}
