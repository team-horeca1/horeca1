'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { VendorSettingsShell } from '@/components/features/vendor/settings/VendorSettingsShell';
import { StoreProfileTab } from '@/components/features/vendor/settings/StoreProfileTab';
import { DeliveryTab } from '@/components/features/vendor/settings/DeliveryTab';
import { PaymentsTab } from '@/components/features/vendor/settings/PaymentsTab';
import { PoliciesTab } from '@/components/features/vendor/settings/PoliciesTab';
import { DocumentsTab } from '@/components/features/vendor/settings/DocumentsTab';
import type { DeliverySlot, ServiceArea, SettingsTabId, VendorDocument, VendorSettings } from '@/components/features/vendor/settings/types';
import { SETTINGS_TABS } from '@/components/features/vendor/settings/types';

function parseTab(raw: string | null): SettingsTabId {
  if (raw && SETTINGS_TABS.some((t) => t.id === raw)) return raw as SettingsTabId;
  return 'store';
}

function VendorSettingsContent() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const activeTab = parseTab(searchParams.get('tab'));

  const [settings, setSettings] = useState<VendorSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [creditEnabled, setCreditEnabled] = useState(false);
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [addressPincode, setAddressPincode] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [newPincode, setNewPincode] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotDay, setSlotDay] = useState(1);
  const [slotStart, setSlotStart] = useState('');
  const [slotEnd, setSlotEnd] = useState('');
  const [slotCutoff, setSlotCutoff] = useState('');
  const [savingSlot, setSavingSlot] = useState(false);
  const [paymentModes, setPaymentModes] = useState<string[]>(['cod', 'prepaid']);
  const [vendorType, setVendorType] = useState<'distributor' | 'wholesaler' | 'dark_store'>('distributor');
  const [multiWarehouseEnabled, setMultiWarehouseEnabled] = useState(false);
  const [configOutlets, setConfigOutlets] = useState<Array<{ id: string; name: string }>>([]);
  const [configOutletId, setConfigOutletId] = useState<string | null>(searchParams.get('outletId'));
  const [showMultiWarehouseConfirm, setShowMultiWarehouseConfirm] = useState(false);
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankShowNumber, setBankShowNumber] = useState(false);
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountType, setBankAccountType] = useState<'current' | 'savings' | ''>('');
  const [defaultMOQ, setDefaultMOQ] = useState('');
  const [defaultTaxPercent, setDefaultTaxPercent] = useState('');
  const [deliveryFeeVal, setDeliveryFeeVal] = useState('');
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState('');
  const [returnPolicy, setReturnPolicy] = useState('');
  const [cancellationPolicy, setCancellationPolicy] = useState('');
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [docType, setDocType] = useState<VendorDocument['type']>('fssai');
  const [docFile, setDocFile] = useState<File | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/vendor/settings');
      const json = await res.json();
      if (json.success) {
        const data = json.data as VendorSettings & {
          defaultMOQ?: number | null;
          defaultTaxPercent?: number | null;
          returnPolicy?: string | null;
          cancellationPolicy?: string | null;
          paymentModes?: string[];
        };
        setSettings(data);
        setBusinessName(data.businessName);
        setDescription(data.description || '');
        setLogoUrl(data.logoUrl || '');
        setBannerUrl(data.bannerUrl || '');
        setMinOrderValue(String(data.minOrderValue));
        setCreditEnabled(data.creditEnabled);
        setAddressLine(data.addressLine || '');
        setCity(data.city || '');
        setStateName(data.state || '');
        setAddressPincode(data.addressPincode || '');
        setGstNumber(data.gstNumber || '');
        setDefaultMOQ(data.defaultMOQ != null ? String(data.defaultMOQ) : '');
        setDefaultTaxPercent(data.defaultTaxPercent != null ? String(data.defaultTaxPercent) : '');
        setDeliveryFeeVal(data.deliveryFee != null ? String(data.deliveryFee) : '');
        setFreeDeliveryAbove(data.freeDeliveryAbove != null ? String(data.freeDeliveryAbove) : '');
        setReturnPolicy(data.returnPolicy || '');
        setCancellationPolicy(data.cancellationPolicy || '');
        if (Array.isArray(data.paymentModes) && data.paymentModes.length > 0) setPaymentModes(data.paymentModes);
        if (data.vendorType === 'distributor' || data.vendorType === 'wholesaler' || data.vendorType === 'dark_store') {
          setVendorType(data.vendorType);
        }
        setMultiWarehouseEnabled(!!data.multiWarehouseEnabled);
        setBankAccountName(data.bankAccountName || '');
        setBankAccountNumber(data.bankAccountNumber || '');
        setBankIfsc(data.bankIfsc || '');
        setBankName(data.bankName || '');
        setBankAccountType((data.bankAccountType as 'current' | 'savings' | '') || '');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!multiWarehouseEnabled) return;
    fetch('/api/v1/vendor/outlets')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          const list = (j.data.outlets ?? []) as Array<{ id: string; name: string }>;
          setConfigOutlets(list);
          if (!configOutletId && list[0]) setConfigOutletId(list[0].id);
        }
      })
      .catch(() => {});
  }, [multiWarehouseEnabled, configOutletId]);

  const scopedServiceAreas = settings?.serviceAreas.filter(
    (a) => !multiWarehouseEnabled || a.outletId === configOutletId,
  ) ?? [];
  const scopedDeliverySlots = settings?.deliverySlots.filter(
    (s) => !multiWarehouseEnabled || s.outletId === configOutletId,
  ) ?? [];

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/vendor/documents');
      const json = await res.json();
      if (json.success) setDocuments(json.data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, []);

  useEffect(() => { void fetchSettings(); void fetchDocuments(); }, [fetchSettings, fetchDocuments]);

  const handleUploadDoc = async () => {
    if (!docFile) return;
    const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(docFile.type)) { toast.error('Unsupported file. Use PDF, JPG, PNG or WebP.'); return; }
    if (docFile.size > 10 * 1024 * 1024) { toast.error('File too large. Max size is 10MB.'); return; }
    try {
      setUploadingDoc(true);
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('type', docType);
      const res = await fetch('/api/v1/vendor/documents/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Upload failed');
      await fetchDocuments();
      setDocFile(null);
      setDocType('fssai');
      if (docFileRef.current) docFileRef.current.value = '';
      toast.success('Document uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaved(false);
      const res = await fetch('/api/v1/vendor/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          description: description || null,
          logoUrl: logoUrl || null,
          bannerUrl: bannerUrl || null,
          minOrderValue: parseFloat(minOrderValue) || 0,
          creditEnabled,
          addressLine: addressLine || undefined,
          city: city || undefined,
          state: stateName || undefined,
          addressPincode: addressPincode || undefined,
          gstNumber: gstNumber || undefined,
          defaultMOQ: defaultMOQ ? parseInt(defaultMOQ, 10) : undefined,
          defaultTaxPercent: defaultTaxPercent ? parseFloat(defaultTaxPercent) : undefined,
          deliveryFee: deliveryFeeVal ? parseFloat(deliveryFeeVal) : undefined,
          freeDeliveryAbove: freeDeliveryAbove ? parseFloat(freeDeliveryAbove) : undefined,
          returnPolicy: returnPolicy || undefined,
          cancellationPolicy: cancellationPolicy || undefined,
          bankAccountName: bankAccountName || null,
          bankAccountNumber: bankAccountNumber || null,
          bankIfsc: bankIfsc || null,
          bankName: bankName || null,
          bankAccountType: bankAccountType || null,
          paymentModes,
          vendorType,
          multiWarehouseEnabled,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddArea = async () => {
    if (!newPincode.trim()) return;
    try {
      setAddingArea(true);
      const res = await fetch('/api/v1/vendor/settings/service-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pincode: newPincode.trim(),
          ...(multiWarehouseEnabled && configOutletId ? { outletId: configOutletId } : {}),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to add');
      setSettings((prev) => (prev ? { ...prev, serviceAreas: [...prev.serviceAreas, json.data] } : prev));
      setNewPincode('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add service area');
    } finally {
      setAddingArea(false);
    }
  };

  const handleToggleArea = async (area: ServiceArea) => {
    try {
      const res = await fetch('/api/v1/vendor/settings/service-areas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: area.id, isActive: !area.isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to update');
      setSettings((prev) => prev ? { ...prev, serviceAreas: prev.serviceAreas.map((a) => a.id === area.id ? json.data : a) } : prev);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDeleteArea = async (area: ServiceArea) => {
    const ok = await confirm({
      title: 'Remove service area?',
      message: `Customers in pincode ${area.pincode} will no longer be able to order from you.`,
      confirmText: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/v1/vendor/settings/service-areas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: area.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete');
      setSettings((prev) => prev ? { ...prev, serviceAreas: prev.serviceAreas.filter((a) => a.id !== area.id) } : prev);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const resetSlotForm = () => {
    setShowSlotForm(false);
    setEditingSlotId(null);
    setSlotDay(1);
    setSlotStart('');
    setSlotEnd('');
    setSlotCutoff('');
  };

  const openAddSlot = () => { resetSlotForm(); setShowSlotForm(true); };

  const openEditSlot = (slot: DeliverySlot) => {
    setEditingSlotId(slot.id);
    setSlotDay(slot.dayOfWeek);
    setSlotStart(slot.slotStart);
    setSlotEnd(slot.slotEnd);
    setSlotCutoff(slot.cutoffTime);
    setShowSlotForm(true);
  };

  const handleSaveSlot = async () => {
    if (!slotStart || !slotEnd || !slotCutoff) { toast.error('Please fill all time fields'); return; }
    try {
      setSavingSlot(true);
      if (editingSlotId) {
        const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingSlotId, dayOfWeek: slotDay, slotStart, slotEnd, cutoffTime: slotCutoff }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Failed to update');
        setSettings((prev) => prev ? { ...prev, deliverySlots: prev.deliverySlots.map((s) => s.id === editingSlotId ? json.data : s) } : prev);
      } else {
        const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dayOfWeek: slotDay,
            slotStart,
            slotEnd,
            cutoffTime: slotCutoff,
            ...(multiWarehouseEnabled && configOutletId ? { outletId: configOutletId } : {}),
          }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error?.message || 'Failed to add');
        setSettings((prev) => prev ? { ...prev, deliverySlots: [...prev.deliverySlots, json.data] } : prev);
      }
      resetSlotForm();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save slot');
    } finally {
      setSavingSlot(false);
    }
  };

  const handleToggleSlot = async (slot: DeliverySlot) => {
    try {
      const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slot.id, isActive: !slot.isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to update');
      setSettings((prev) => prev ? { ...prev, deliverySlots: prev.deliverySlots.map((s) => s.id === slot.id ? json.data : s) } : prev);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDeleteSlot = async (slot: DeliverySlot) => {
    const ok = await confirm({
      title: 'Delete delivery slot?',
      message: 'This slot will be removed. Try deactivating if linked to orders.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: slot.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to delete');
      setSettings((prev) => prev ? { ...prev, deliverySlots: prev.deliverySlots.filter((s) => s.id !== slot.id) } : prev);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[#299E60]" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-[16px] font-bold text-[#7C7C7C]">Failed to load settings</p>
      </div>
    );
  }

  const saveProps = { saving, saved, onSave: handleSave };

  return (
    <>
      <VendorSettingsShell activeTab={activeTab} userEmail={settings.user.email}>
        {activeTab === 'store' && (
          <StoreProfileTab
            businessName={businessName} setBusinessName={setBusinessName}
            description={description} setDescription={setDescription}
            logoUrl={logoUrl} setLogoUrl={setLogoUrl}
            bannerUrl={bannerUrl} setBannerUrl={setBannerUrl}
            vendorType={vendorType} setVendorType={setVendorType}
            multiWarehouseEnabled={multiWarehouseEnabled}
            setMultiWarehouseEnabled={setMultiWarehouseEnabled}
            onRequestMultiWarehouseEnable={() => setShowMultiWarehouseConfirm(true)}
            minOrderValue={minOrderValue} setMinOrderValue={setMinOrderValue}
            creditEnabled={creditEnabled} setCreditEnabled={setCreditEnabled}
            addressLine={addressLine} setAddressLine={setAddressLine}
            city={city} setCity={setCity}
            stateName={stateName} setStateName={setStateName}
            addressPincode={addressPincode} setAddressPincode={setAddressPincode}
            gstNumber={gstNumber} setGstNumber={setGstNumber}
            {...saveProps}
          />
        )}
        {activeTab === 'delivery' && (
          <DeliveryTab
            multiWarehouseEnabled={multiWarehouseEnabled}
            configOutlets={configOutlets}
            configOutletId={configOutletId}
            setConfigOutletId={setConfigOutletId}
            scopedServiceAreas={scopedServiceAreas}
            scopedDeliverySlots={scopedDeliverySlots}
            newPincode={newPincode} setNewPincode={setNewPincode}
            addingArea={addingArea} onAddArea={handleAddArea}
            onToggleArea={handleToggleArea} onDeleteArea={handleDeleteArea}
            showSlotForm={showSlotForm} editingSlotId={editingSlotId}
            slotDay={slotDay} setSlotDay={setSlotDay}
            slotStart={slotStart} setSlotStart={setSlotStart}
            slotEnd={slotEnd} setSlotEnd={setSlotEnd}
            slotCutoff={slotCutoff} setSlotCutoff={setSlotCutoff}
            savingSlot={savingSlot}
            onOpenAddSlot={openAddSlot} onOpenEditSlot={openEditSlot}
            onSaveSlot={handleSaveSlot} onResetSlotForm={resetSlotForm}
            onToggleSlot={handleToggleSlot} onDeleteSlot={handleDeleteSlot}
            defaultMOQ={defaultMOQ} setDefaultMOQ={setDefaultMOQ}
            defaultTaxPercent={defaultTaxPercent} setDefaultTaxPercent={setDefaultTaxPercent}
            deliveryFeeVal={deliveryFeeVal} setDeliveryFeeVal={setDeliveryFeeVal}
            freeDeliveryAbove={freeDeliveryAbove} setFreeDeliveryAbove={setFreeDeliveryAbove}
            {...saveProps}
          />
        )}
        {activeTab === 'payments' && (
          <PaymentsTab
            paymentModes={paymentModes} setPaymentModes={setPaymentModes}
            bankAccountName={bankAccountName} setBankAccountName={setBankAccountName}
            bankAccountNumber={bankAccountNumber} setBankAccountNumber={setBankAccountNumber}
            bankShowNumber={bankShowNumber} setBankShowNumber={setBankShowNumber}
            bankIfsc={bankIfsc} setBankIfsc={setBankIfsc}
            bankName={bankName} setBankName={setBankName}
            bankAccountType={bankAccountType} setBankAccountType={setBankAccountType}
            {...saveProps}
          />
        )}
        {activeTab === 'policies' && (
          <PoliciesTab
            returnPolicy={returnPolicy} setReturnPolicy={setReturnPolicy}
            cancellationPolicy={cancellationPolicy} setCancellationPolicy={setCancellationPolicy}
            {...saveProps}
          />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            documents={documents}
            docType={docType} setDocType={setDocType}
            docFile={docFile} setDocFile={setDocFile}
            uploadingDoc={uploadingDoc}
            onUpload={handleUploadDoc}
          />
        )}
      </VendorSettingsShell>

      {showMultiWarehouseConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-[14px] max-w-md w-full p-6 border border-[#EEEEEE] shadow-xl">
            <h3 className="text-[16px] font-bold text-[#181725]">Enable multi-warehouse?</h3>
            <p className="text-[13px] text-[#7C7C7C] mt-2 leading-relaxed">
              Stock rows will be created for each outlet (new outlets start at zero). You can split inventory and transfer stock between warehouses after saving.
            </p>
            <div className="flex gap-2 justify-end mt-6">
              <button type="button" onClick={() => setShowMultiWarehouseConfirm(false)} className="h-[40px] px-4 rounded-[10px] border border-[#EEEEEE] text-[13px] font-bold">Cancel</button>
              <button type="button" onClick={() => { setMultiWarehouseEnabled(true); setShowMultiWarehouseConfirm(false); }} className="h-[40px] px-4 rounded-[10px] bg-[#299E60] text-white text-[13px] font-bold">Enable &amp; continue</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function VendorSettingsPage() {
  return (
    <Suspense fallback={(
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 size={36} className="animate-spin text-[#299E60]" />
      </div>
    )}>
      <VendorSettingsContent />
    </Suspense>
  );
}
