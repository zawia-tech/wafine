import { Landing } from '@/components/marketing/landing';
import { SignedInRedirect } from '@/components/marketing/signed-in-redirect';

export default function HomePage() {
  return (
    <>
      <SignedInRedirect />
      <Landing />
    </>
  );
}
