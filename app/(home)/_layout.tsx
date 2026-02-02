import { Stack } from 'expo-router';

export default function HomeLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="checkout" />
            <Stack.Screen name="activity" />
            <Stack.Screen name="studio/[id]" />
            <Stack.Screen name="studio/equipment-list" />
            <Stack.Screen name="studio/add-equipment" />
            <Stack.Screen name="studio/members" />
            <Stack.Screen name="studio/equipment/[equipmentId]" />
        </Stack>
    );
}
