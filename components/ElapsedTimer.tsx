import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
    date: string | Date;
    big?: boolean
};

function formatTime(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, "0");

    if (hours > 0) {
        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
}

export default function ElapsedTimer({ date, big }: Props) {
    const [time, setTime] = useState(0);

    useEffect(() => {
        const start = new Date(date).getTime();

        const update = () => {
            const now = Date.now();
            setTime(Math.max(0, now - start));
        };

        update();

        const interval = setInterval(update, 1000);

        return () => clearInterval(interval);
    }, [date]);

    if (big) return (
        <View style={{ paddingVertical: 10, width: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6F8ED', borderColor: '#D2E9E0', borderWidth: 1, borderRadius: 12 }}>
            <Text style={[styles.container, big ? {
                borderColor: 'transparent', paddingVertical: 0, fontSize: 24,
                paddingHorizontal: 0,
            } : {}]}>{formatTime(time)}</Text>
        </View>
    )

    return (
        <Text style={[styles.container, big ? { paddingVertical: 10, width: '100%', alignItems: 'center', justifyContent: 'center' } : {}]}>{formatTime(time)}</Text>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#E6F8ED',
        borderColor: '#D2E9E0',
        color: '#107550',
        fontSize: 18,
        fontWeight: "600",
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 12
    }
})