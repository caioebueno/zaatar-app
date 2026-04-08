import Feather from "@expo/vector-icons/Feather";
import { Audio } from "expo-av";
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextProps, View } from "react-native";

type TSnooze = {
  startedAt: string;
  duration: number; // seconds
};

type Props = TextProps & {
  snooze: TSnooze | null;
  onEnd?: () => void;
  small?: boolean
};

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function SnoozeCountdown({
  snooze,
  onEnd,
  small,
  ...textProps
}: Props) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const hasEndedRef = useRef(false);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const endAt = useMemo(() => {
    if (!snooze) return null;

    return new Date(snooze.startedAt).getTime() + snooze.duration * 1000;
  }, [snooze]);

  const [remaining, setRemaining] = useState(() => {
    if (!endAt) return 0;
    return Math.max(0, endAt - Date.now());
  });

  async function playNotification() {
    try {
      if (!soundRef.current) return;
      await soundRef.current.replayAsync();
    } catch (error) {
      console.log("Failed to play notification sound:", error);
    }
  }

  function stopRepeatingNotification() {
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }

  function startRepeatingNotification() {
    if (repeatIntervalRef.current) return;

    repeatIntervalRef.current = setInterval(() => {
      playNotification();
    }, 10000);
  }

  useEffect(() => {
    const loadSound = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        const { sound } = await Audio.Sound.createAsync(
          require("../assets/notification.mp3"),
        );

        soundRef.current = sound;
      } catch (error) {
        console.log("Failed to load sound:", error);
      }
    };

    loadSound();

    return () => {
      stopRepeatingNotification();
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  useEffect(() => {
    hasEndedRef.current = false;
    stopRepeatingNotification();

    if (!endAt) {
      setRemaining(0);
      return;
    }

    const update = async () => {
      const next = Math.max(0, endAt - Date.now());
      setRemaining(next);

      if (next === 0 && !hasEndedRef.current) {
        hasEndedRef.current = true;
        await playNotification();
        startRepeatingNotification();
        onEnd?.();
      }
    };

    update();

    const interval = setInterval(() => {
      update();
    }, 1000);

    return () => {
      clearInterval(interval);
      stopRepeatingNotification();
    };
  }, [endAt, onEnd]);

  if (!snooze) {
    return null;
  }

  return (
    <View style={{ flexDirection: "row", gap: small ? 8 : 12, alignItems: "center" }}>
      <Feather name="clock" size={small ? 20 : 40} color="#96632C" />
      <Text
        style={{ fontSize: small ? 20 : 36, fontWeight: "600", color: "#96632C" }}
        {...textProps}
      >
        {formatRemaining(remaining)}
      </Text>
    </View>
  );
}