import Link from "next/link";
import { ArrowLeft, Share2, Smartphone } from "lucide-react";
import { PageHeading } from "@/components/secret-santa/components";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAllowlisted } from "@/lib/authz";

export default async function AddFromPhoneHelpPage() {
  await requireAllowlisted();
  const shortcutUrl = process.env.NEXT_PUBLIC_IOS_SHORTCUT_URL;
  return <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
    <Link href="/wishlists" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="size-4" /> My Wishlists</Link>
    <PageHeading eyebrow="Mobile wish lists" title="Add from your phone" description="Send a product page straight to the right wish list while you shop." />
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="space-y-4 p-5 sm:p-6"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-pine"><Share2 className="size-5" /></span><div><h2 className="font-bold">Android and other browsers</h2><p className="mt-1 text-sm text-muted-foreground">Open a product page, tap Share, then choose Secret Santa. Pick an exchange if you belong to more than one.</p></div></Card>
      <Card className="space-y-4 p-5 sm:p-6"><span className="grid size-11 place-items-center rounded-xl bg-secondary text-pine"><Smartphone className="size-5" /></span><div><h2 className="font-bold">iPhone</h2><p className="mt-1 text-sm text-muted-foreground">Use the Shortcut to send the current Safari page here. Review the item details and choose which exchange to add it to.</p></div>{shortcutUrl ? <Button asChild><a href={shortcutUrl}>Get the iPhone Shortcut</a></Button> : <p className="text-sm text-muted-foreground">The iPhone Shortcut link has not been configured yet.</p>}</Card>
    </div>
    <p className="text-sm text-muted-foreground">You can also paste a product link directly into the Add a wish form. Secret Santa will fill in the details it can find, and you can edit them before saving.</p>
  </div>;
}
