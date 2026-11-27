import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { entryQuery } from "../../../api/queries";
import { EntryEditor } from "../../../components/EntryEditor";
import { QueryGate } from "../../../components/QueryGate";
import { parseCollectionParam } from "../../../state/collectionParam";

export const Route = createFileRoute("/_app/c/$collection/$id")({
  params: { parse: parseCollectionParam },
  component: EntryPage,
});

function EntryPage() {
  const { collection, id } = Route.useParams();
  const detail = useQuery(entryQuery(collection, id));
  // A saved item comes back with a new version: the form starts again from what the server holds.
  return <QueryGate query={detail}>{(loaded) => <EntryEditor key={`${collection}/${id}/${loaded.entry.version}`} collection={collection} detail={loaded} />}</QueryGate>;
}
