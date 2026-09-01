'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Clock, ChevronRight, ClipboardList, ChevronLeft, Trash2, Edit2, Heart, ShoppingCart, Home, Building2, AlertCircle, X as XIcon } from 'lucide-react';
import { dal } from '@/lib/dal';
import type { Vendor, VendorProduct, OrderList } from '@/types';
import { StickyCartBar } from '@/components/features/vendor/StickyCartBar';
import { useCart } from '@/context/CartContext';
import { toast } from 'sonner';
import { useStableSession } from '@/hooks/useStableSession';
import { CreateListOverlay } from '@/components/features/order-lists/CreateListOverlay';

export default function OrderListsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const vendorFilterId = searchParams.get('vendorId');
    const { session, isAuthenticated, isResolved } = useStableSession();
    const isLoggedIn = isAuthenticated;
    const { totalItems, addToCart } = useCart();
    const [allLists, setAllLists] = React.useState<OrderList[]>([]);
    const [isCreateOverlayOpen, setIsCreateOverlayOpen] = React.useState(false);
    const [editingList, setEditingList] = React.useState<OrderList | null>(null);
    const [listToDelete, setListToDelete] = React.useState<string | null>(null);
    const [vendorsList, setVendorsList] = React.useState<Vendor[]>([]);
    const [vendorProductsMap, setVendorProductsMap] = React.useState<Record<string, VendorProduct[]>>({});

    // Load vendors and their products from the DAL
    React.useEffect(() => {
        dal.vendors.list()
            .then(result => {
                setVendorsList(result.vendors);
                return Promise.all(
                    result.vendors.map(v =>
                        dal.vendors.getProducts(v.id)
                            .then(r => ({ vendorId: v.id, products: r.products }))
                            .catch(() => ({ vendorId: v.id, products: [] as VendorProduct[] }))
                    )
                );
            })
            .then(results => {
                const map: Record<string, VendorProduct[]> = {};
                results.forEach(r => { map[r.vendorId] = r.products; });
                setVendorProductsMap(map);
            })
            .catch(() => {
                setVendorsList([]);
                setVendorProductsMap({});
            });
    }, []);

    // Initial load: only for authenticated users. Order lists are tied to a user
    // profile (QuickOrderList.userId), so guest users have nothing to load — and
    // localStorage from a prior session must not leak across logout.
    // The DB is the source of truth — always fetch fresh so deletes that happened
    // on another device (or via the API directly) don't get resurrected from a
    // stale localStorage cache.
    React.useEffect(() => {
        if (!isLoggedIn) {
            setAllLists([]);
            return;
        }

        dal.lists.getAll()
            .then(parsed => {
                // Carry over the locally-tracked `lastUsed` (Quick Order timestamp,
                // not persisted server-side) by matching list ids from the cache.
                const savedAll = localStorage.getItem('horeca_order_lists_all');
                let withLastUsed: OrderList[] = parsed;
                if (savedAll) {
                    try {
                        const cached: Array<Record<string, unknown>> = JSON.parse(savedAll);
                        const lastUsedMap = new Map<string, Date>();
                        cached.forEach(l => {
                            if (typeof l.id === 'string' && l.lastUsed) {
                                lastUsedMap.set(l.id, new Date(l.lastUsed as string));
                            }
                        });
                        withLastUsed = parsed.map(l => {
                            const lu = lastUsedMap.get(l.id);
                            return lu ? { ...l, lastUsed: lu } : l;
                        });
                    } catch (e) {
                        console.error('Failed to parse all lists', e);
                    }
                }

                setAllLists(withLastUsed);
                localStorage.setItem('horeca_order_lists_all', JSON.stringify(withLastUsed));
                window.dispatchEvent(new Event('storage'));
            })
            .catch(() => {
                setAllLists([]);
            });
    }, [isLoggedIn]);

    const handleCreateList = async (data: { name: string; items: { productId: string; quantity: number; vendorId: string }[] }) => {
        // Derive unique vendors from the items
        const vendorIds = [...new Set(data.items.map(i => i.vendorId))];
        const vendors = vendorIds
            .map(id => vendorsList.find(v => v.id === id))
            .filter((v): v is NonNullable<typeof v> => !!v);

        if (vendors.length === 0) return;

        const primaryVendor = vendors[0];
        // Display name: single vendor name OR "VendorName +N more"
        const vendorName = vendors.length === 1
            ? vendors[0].name
            : `${vendors[0].name} +${vendors.length - 1} more`;

        // Map each item to its product using per-item vendorId
        const mappedItems = data.items
            .map(item => {
                const product = (vendorProductsMap[item.vendorId] || []).find(p => p.id === item.productId);
                if (!product) return null;
                return {
                    productId: item.productId,
                    product,
                    defaultQty: item.quantity,
                    lastOrderedQty: item.quantity
                };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        // Items payload for the API — carries each item's true vendorId so a
        // multi-vendor list keeps each item attached to the correct vendor.
        const apiItems = data.items.map(i => ({
            productId: i.productId,
            defaultQty: i.quantity,
            vendorId: i.vendorId,
        }));

        let updated: OrderList[];

        if (editingList) {
            // The list API has no PATCH endpoint — delete the old row and recreate
            // so the edit survives logout. Local-only drafts (custom-<ts>) just
            // get replaced in localStorage.
            try {
                if (!editingList.id.startsWith('custom-')) {
                    await dal.lists.delete(editingList.id);
                }
                const created = await dal.lists.create(data.name, primaryVendor.id, apiItems);
                const updatedList: OrderList = {
                    ...editingList,
                    id: created.id,
                    name: data.name,
                    vendorId: primaryVendor.id,
                    vendorName,
                    vendorLogo: primaryVendor.logo,
                    items: mappedItems,
                    updatedAt: new Date(),
                };
                updated = allLists.map(l => l.id === editingList.id ? updatedList : l);
                toast.success(`List "${data.name}" updated!`);
            } catch {
                toast.error('Failed to update order list');
                return;
            }
            setEditingList(null);
        } else {
            try {
                const created = await dal.lists.create(data.name, primaryVendor.id, apiItems);
                const newList: OrderList = {
                    id: created.id,
                    name: data.name,
                    userId: session?.user?.id || '',
                    vendorId: primaryVendor.id,
                    vendorName,
                    vendorLogo: primaryVendor.logo,
                    items: mappedItems,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    // lastUsed intentionally undefined for new lists
                };
                updated = [...allLists, newList];
                toast.success(`List "${data.name}" created!`);
            } catch {
                toast.error('Failed to create order list');
                return;
            }
        }

        setAllLists(updated);
        localStorage.setItem('horeca_order_lists_all', JSON.stringify(updated));
        window.dispatchEvent(new Event('storage'));
    };

    const handleDeleteList = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setListToDelete(id);
    };

    const confirmDelete = async () => {
        if (!listToDelete) return;
        const idToDelete = listToDelete;
        // Locally-created lists (CreateListOverlay path) get a "custom-<timestamp>" id
        // and were never persisted to the DB — skip the API call for those.
        const isLocalOnly = idToDelete.startsWith('custom-');

        if (!isLocalOnly) {
            try {
                await dal.lists.delete(idToDelete);
            } catch (err) {
                const msg = err instanceof Error ? err.message : '';
                // A 404 means the row is already gone in the DB — treat as success and
                // fall through to local cleanup. Anything else is a real failure.
                if (!/not found/i.test(msg)) {
                    toast.error('Failed to delete order list');
                    return;
                }
            }
        }

        const updated = allLists.filter(l => l.id !== idToDelete);
        setAllLists(updated);
        localStorage.setItem('horeca_order_lists_all', JSON.stringify(updated));
        // Trigger storage event for same-tab reactivity in ContinueOrdering component
        window.dispatchEvent(new Event('storage'));
        toast.success('Order list deleted');
        setListToDelete(null);
    };

    const handleEditClick = (list: OrderList, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingList(list);
        setIsCreateOverlayOpen(true);
    };

    // Filter by vendor when ?vendorId=... is in URL (e.g. vendor store shortcut)
    const displayedLists = React.useMemo(() => {
        if (!vendorFilterId) return allLists;
        return allLists.filter(list =>
            list.vendorId === vendorFilterId ||
            list.items.some(i => (i.product?.vendorId || list.vendorId) === vendorFilterId)
        );
    }, [allLists, vendorFilterId]);

    const filteredVendorName = React.useMemo(() => {
        if (!vendorFilterId) return null;
        return vendorsList.find(v => v.id === vendorFilterId)?.name ?? null;
    }, [vendorFilterId, vendorsList]);

    if (!isResolved) {
        return null;
    }

    // Guest users cannot have order lists — lists are tied to User.id
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-50/50 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-[#53B175]/10 flex items-center justify-center mb-5">
                    <ClipboardList size={28} className="text-[#53B175]" strokeWidth={2.5} />
                </div>
                <h1 className="text-[22px] md:text-[26px] font-[900] text-[#181725] tracking-tight mb-2">
                    Log in to see your order lists
                </h1>
                <p className="text-[14px] text-gray-500 max-w-[360px] mb-6">
                    Order lists are saved to your account so you can reorder the same items in one click. Please log in to continue.
                </p>
                <div className="flex items-center gap-3">
                    <Link
                        href="/"
                        className="px-6 py-3 rounded-2xl bg-white border border-gray-200 text-[#181725] font-black text-[14px] hover:bg-gray-50 transition-colors"
                    >
                        Back to home
                    </Link>
                    <Link
                        href="/login?redirect=/order-lists"
                        className="px-6 py-3 rounded-2xl bg-[#53B175] text-white font-black text-[14px] shadow-md hover:bg-[#469E66] transition-colors cursor-pointer"
                    >
                        Log in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50/50 pb-24">
            {/* Desktop Header */}
            <div className="hidden md:block bg-[#F7F8FA] border-b border-gray-100">
                <div className="md:max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-6">
                    <div className="flex items-center gap-2 text-[13px] text-text-muted mb-3">
                        <Link href="/" className="hover:text-primary transition-colors flex items-center gap-1">
                            <Home size={14} />
                            <span>Home</span>
                        </Link>
                        <ChevronRight size={12} />
                        <span className="text-text font-semibold">Order Lists</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <h1 className="text-[32px] font-black text-text tracking-tight">
                            <ClipboardList size={32} className="inline-block mr-3 -mt-1 text-primary" />
                            Quick Order Lists
                        </h1>
                        <button 
                            onClick={() => setIsCreateOverlayOpen(true)}
                            className="flex items-center justify-center bg-[#299e60] text-white px-6 py-3 rounded-xl text-[14px] font-bold shadow-md shadow-green-100/50 hover:bg-[#22844f] transition-all cursor-pointer"
                        >
                            <Plus size={20} />
                            <span className="ml-2">New List</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-3 min-[340px]:py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 min-[340px]:gap-2 min-w-0">
                            <button 
                                onClick={() => router.push('/')} 
                                className="p-1 min-[340px]:p-2 -ml-1 min-[340px]:-ml-2 hover:bg-gray-50 rounded-full transition-colors shrink-0 cursor-pointer"
                            >
                                <ChevronLeft size={22} className="text-[#181725]" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-[18px] min-[340px]:text-[20px] font-bold text-[#181725] leading-tight truncate">
                                    Quick Order Lists
                                </h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                onClick={() => setIsCreateOverlayOpen(true)}
                                className="flex items-center justify-center bg-[#299e60] text-white w-9 h-9 min-[340px]:w-10 min-[340px]:h-10 sm:w-auto sm:px-4 sm:py-2 rounded-full sm:rounded-xl text-[12px] font-bold shadow-md shadow-green-100/50 hover:bg-[#22844f] transition-all cursor-pointer"
                            >
                                <Plus size={18} />
                                <span className="hidden sm:inline ml-1.5">New List</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <CreateListOverlay 
                isOpen={isCreateOverlayOpen}
                onClose={() => {
                    setIsCreateOverlayOpen(false);
                    setEditingList(null);
                }}
                onSave={handleCreateList}
                initialData={editingList}
            />

            {/* Lists */}
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4">
                {vendorFilterId && (
                    <div className="mb-3 flex items-center justify-between gap-3 bg-[#EEF8F1] border border-[#299e60]/20 rounded-xl px-4 py-2.5">
                        <p className="text-[13px] font-bold text-[#1B5E20] truncate">
                            Showing lists for {filteredVendorName ?? 'this vendor'}
                            <span className="text-[11px] font-semibold text-[#299e60] ml-2">
                                ({displayedLists.length} of {allLists.length})
                            </span>
                        </p>
                        <Link
                            href="/order-lists"
                            className="flex items-center gap-1 shrink-0 text-[12px] font-bold text-[#299e60] hover:text-[#1B5E20] transition-colors"
                        >
                            <XIcon size={14} /> Clear
                        </Link>
                    </div>
                )}
                {displayedLists.length > 0 ? (
                    <div className="space-y-3">
                        {displayedLists.map((list) => (
                                <Link
                                    key={list.id}
                                    href={`/order-lists/${list.id}`}
                                    className="flex items-center gap-2 min-[340px]:gap-4 bg-white rounded-2xl p-2.5 min-[340px]:p-4 border border-gray-100 hover:shadow-lg hover:shadow-gray-100/50 transition-all group"
                                >
                                {(() => {
                                    // Extract all unique vendor IDs from the items
                                    const itemsVendorIds = Array.from(new Set((list.items ?? []).map(i => i.product?.vendorId || list.vendorId)));
                                    // Map them to their actual logos from vendorsList
                                    const logos = itemsVendorIds
                                        .map(vid => vendorsList.find(v => v.id === vid)?.logo)
                                        .filter(Boolean);

                                    const isStack = logos.length > 1;

                                    if (isStack) {
                                        return (
                                            <div className="relative w-12 h-12 min-[340px]:w-14 min-[340px]:h-14 md:w-20 md:h-20 shrink-0 flex items-center justify-center">
                                                {logos.slice(0, 4).map((logo, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="absolute rounded-full overflow-hidden aspect-square bg-transparent"
                                                        style={{
                                                            width: '60%',
                                                            height: '60%',
                                                            left: (idx === 1 || idx === 3) ? '40%' : '0%',
                                                            top: (idx === 2 || idx === 3) ? '40%' : '0%',
                                                            zIndex: 10 - idx
                                                        }}
                                                    >
                                                        <img src={logo} alt="" className="w-full h-full object-cover rounded-full" />
                                                    </div>
                                                ))}
                                                {logos.length > 4 && (
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 md:w-6 md:h-6 rounded-full bg-primary text-white text-[9px] md:text-[10px] font-bold flex items-center justify-center border-[1.5px] border-white z-20 shadow-sm">
                                                        +{logos.length - 4}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }

                                    return (
                                        /* Logo — Single */
                                        <div className="w-12 h-12 min-[340px]:w-14 min-[340px]:h-14 md:w-20 md:h-20 rounded-full border border-gray-100 bg-white overflow-hidden shrink-0 flex items-center justify-center shadow-sm">
                                            {list.vendorLogo ? (
                                                <img src={list.vendorLogo} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <Building2 size={24} className="text-gray-200" />
                                            )}
                                        </div>
                                    );
                                })()}

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[14px] min-[340px]:text-[16px] md:text-[18px] font-bold text-[#181725] line-clamp-1">{list.name}</p>
                                        </div>
                                        <p className="text-[10px] min-[340px]:text-[12px] md:text-[14px] text-[#299e60] font-bold mt-0.5 truncate">
                                            {(() => {
                                                const itemsVendorIds = Array.from(new Set((list.items ?? []).map(i => i.product?.vendorId || list.vendorId)));
                                                const firstVendor = vendorsList.find(v => v.id === itemsVendorIds[0]) || { name: list.vendorName };
                                                return itemsVendorIds.length > 1 
                                                    ? `${firstVendor.name} +${itemsVendorIds.length - 1} more` 
                                                    : firstVendor.name;
                                            })()}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1.5 min-[340px]:gap-3 mt-1 min-[340px]:mt-1.5">
                                            <span className="text-[10px] min-[340px]:text-[12px] md:text-[13px] text-gray-400 font-semibold">
                                                {(list.items ?? []).length} items
                                            </span>
                                            {list.lastUsed ? (
                                                <span className="flex items-center gap-0.5 text-[10px] min-[340px]:text-[12px] md:text-[13px] text-[#299e60] font-bold whitespace-nowrap">
                                                    <Clock size={10} className="md:w-3.5 md:h-3.5" />
                                                    <span>
                                                        Used {new Date(list.lastUsed).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-0.5 text-[10px] min-[340px]:text-[12px] md:text-[13px] text-gray-400 font-bold whitespace-nowrap px-2 py-0.5 bg-gray-50 rounded-full border border-gray-100">
                                                    <AlertCircle size={10} className="md:w-3.5 md:h-3.5" />
                                                    <span>Never used</span>
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-0.5 min-[340px]:gap-2 md:gap-4 ml-auto shrink-0 transition-all">
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                // Quick Order Logic: Use defaultQty if defined, fallback to 1
                                                (list.items ?? []).forEach(item => {
                                                    if (item.product) addToCart(item.product, item.defaultQty || 1);
                                                });
                                                
                                                const now = new Date();
                                                const updated = allLists.map(l => l.id === list.id ? { ...l, lastUsed: now } : l);
                                                setAllLists(updated);
                                                localStorage.setItem('horeca_order_lists_all', JSON.stringify(updated));
                                                window.dispatchEvent(new Event('storage'));
                                                
                                                toast.success(`Quick Ordered: ${list.name}`, {
                                                    description: "Items added to cart and list moved to 'Continue Ordering'!",
                                                    icon: <ShoppingCart className="text-white bg-[#299e60] p-1 rounded-full" size={18} />
                                                });
                                            }}
                                            className="p-1.5 min-[340px]:p-2 md:p-3 hover:bg-[#299e60]/10 rounded-xl text-gray-400 hover:text-[#299e60] transition-all active:scale-95 cursor-pointer group/order"
                                            title="Quick Order"
                                        >
                                            <ShoppingCart size={15} className="md:w-5 md:h-5" />
                                        </button>
                                        <button 
                                            onClick={(e) => handleEditClick(list, e)}
                                            className="p-1.5 min-[340px]:p-2 md:p-3 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-[#53B175] transition-all active:scale-95 cursor-pointer"
                                        >
                                            <Edit2 size={15} className="md:w-5 md:h-5" />
                                        </button>
                                        <button 
                                            onClick={(e) => handleDeleteList(list.id, e)}
                                            className="p-1.5 min-[340px]:p-2 md:p-3 hover:bg-red-50 rounded-xl text-gray-400 hover:text-red-500 transition-all active:scale-95 cursor-pointer"
                                        >
                                            <Trash2 size={15} className="md:w-5 md:h-5" />
                                        </button>
                                        <ChevronRight size={18} className="text-gray-300 group-hover/link:text-gray-500 transition-colors ml-0.5 min-[340px]:ml-1 md:w-6 md:h-6" />
                                    </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-16">
                        <p className="text-[48px] mb-3">📋</p>
                        <p className="text-[16px] font-bold text-gray-700">No order lists yet</p>
                        <p className="text-[13px] text-gray-400 mt-1">Create your first list for fast repeat ordering</p>
                        <button 
                            onClick={() => setIsCreateOverlayOpen(true)}
                            className="mt-4 bg-[#299e60] text-white px-6 py-2.5 rounded-xl text-[13px] font-bold shadow-md shadow-green-200/50 hover:bg-[#22844f] transition-all"
                        >
                            Create Order List
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {listToDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
                    <div 
                        className="absolute inset-0 bg-[#181725]/40 backdrop-blur-sm" 
                        onClick={() => setListToDelete(null)} 
                    />
                    <div className="relative bg-white w-full max-w-[400px] rounded-[24px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-8 text-center">
                            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5 text-red-500">
                                <Trash2 size={32} strokeWidth={2.5} />
                            </div>
                            <h3 className="text-[20px] font-black text-[#181725] mb-2">Delete this list?</h3>
                            <p className="text-[14px] text-gray-400 font-medium leading-relaxed">
                                Are you sure you want to delete <span className="text-[#181725] font-bold">&quot;{allLists.find(l => l.id === listToDelete)?.name}&quot;</span>?
                                This action cannot be undone.
                            </p>
                        </div>
                        <div className="p-6 bg-gray-50 flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => setListToDelete(null)}
                                className="flex-1 px-6 py-4 rounded-xl text-[15px] font-bold text-[#181725] bg-white border border-gray-200 hover:bg-gray-100 transition-colors order-2 sm:order-1"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 px-6 py-4 rounded-xl text-[15px] font-bold text-white bg-red-500 shadow-lg shadow-red-200 hover:bg-red-600 transition-all active:scale-95 order-1 sm:order-2"
                            >
                                Delete List
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <StickyCartBar />
        </div>
    );
}
