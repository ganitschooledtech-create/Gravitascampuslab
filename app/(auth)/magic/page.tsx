import { ActionForm } from "@/components/ui/action-form";
import { consumeMagicAction } from "../actions";

export const metadata = { title: "Log in" };

export default async function MagicPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="card text-center">
      <h1 className="mb-2 text-2xl">Almost there!</h1>
      <p className="mb-4 text-muted">Press the button to finish logging in.</p>
      <ActionForm action={consumeMagicAction} submitLabel="Log me in">
        <input type="hidden" name="token" value={token ?? ""} />
      </ActionForm>
    </div>
  );
}
