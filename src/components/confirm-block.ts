import { Alert } from 'react-native';

/** The Block confirm (Friends and the Inbox): `handle` is '@ana', or 'this rider' when the name isn't known (D73). */
export function confirmBlock(handle: string, onBlock: () => void): void {
  Alert.alert(`Block ${handle}?`, "They won't be told. They can't send to you or invite you.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Block', style: 'destructive', onPress: onBlock },
  ]);
}
