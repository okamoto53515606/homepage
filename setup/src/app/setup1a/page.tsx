"use client";

import { useEffect, useState } from "react";
import { Step1aCdk } from "@/components/step1a-cdk";
import { Step1aCognitoUser } from "@/components/step1a-cognito-user";

export default function Setup1aPage() {
  const [cdkDone, setCdkDone] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data) => {
        const phase = data.phases?.find(
          (p: { id: string }) => p.id === "setup1a"
        );
        if (phase?.status === "completed") {
          setCdkDone(true);
          setCompleted(true);
        } else if (
          phase?.comment &&
          phase.comment.includes("CDK deploy 完了")
        ) {
          setCdkDone(true);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <Step1aCdk
        completed={cdkDone}
        onComplete={() => setCdkDone(true)}
      />
      {cdkDone && (
        <div className="border-t pt-8">
          <Step1aCognitoUser completed={completed} />
        </div>
      )}
    </div>
  );
}
